#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, SocketAddr, TcpStream, UdpSocket};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[tauri::command]
fn launch_native_terminal(cmd_str: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { Command::new("cmd").args(["/c", "start", "cmd", "/k", &cmd_str]).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "macos")]
    { Command::new("osascript").args(["-e", &format!("tell app \"Terminal\" to do script \"{}\"", cmd_str)]).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")]
    { Command::new("x-terminal-emulator").args(["-e", &cmd_str]).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}

fn get_default_gateway() -> Option<String> {
    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("route").arg("print").arg("-4").output() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 && parts[0] == "0.0.0.0" { return Some(parts[2].to_string()); }
            }
        }
    } else if cfg!(target_os = "macos") {
        if let Ok(output) = Command::new("route").args(["-n", "get", "default"]).output() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                if line.contains("gateway:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 { return Some(parts[1].to_string()); }
                }
            }
        }
    } else {
        if let Ok(output) = Command::new("ip").args(["route", "show", "default"]).output() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = out_str.split_whitespace().collect();
            if parts.len() >= 3 && parts[0] == "default" && parts[1] == "via" { return Some(parts[2].to_string()); }
        }
    }
    None
}

fn get_local_info(gateway_ip: &str) -> (String, String) {
    let mut local_ip = String::new();
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        let target = if gateway_ip.is_empty() { "8.8.8.8:80".to_string() } else { format!("{}:80", gateway_ip) };
        if socket.connect(&target).is_ok() {
            if let Ok(addr) = socket.local_addr() { local_ip = addr.ip().to_string(); }
        }
    }

    let mut local_mac = "Unknown".to_string();
    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("ipconfig").arg("/all").output() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            let mut current_mac = String::new();
            for line in out_str.lines() {
                let line_lower = line.to_lowercase();
                if line_lower.contains("physical address") || line.contains("物理アドレス") {
                    let parts: Vec<&str> = line.split(':').collect();
                    if parts.len() > 1 { current_mac = parts[1].trim().replace("-", ":").to_uppercase(); }
                }
                if line.contains(&local_ip) && !current_mac.is_empty() { local_mac = current_mac.clone(); }
            }
        }
    } else {
        if let Ok(output) = Command::new("ip").args(["addr", "show"]).output() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            let mut c_mac = String::new();
            for line in out_str.lines() {
                if line.contains("link/ether") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 { c_mac = parts[1].to_uppercase(); }
                }
                if line.contains(&format!("inet {}", local_ip)) { local_mac = c_mac; break; }
            }
        }
    }
    (local_ip, local_mac)
}

fn is_valid_host(ip: &str, mac: &str) -> bool {
    !ip.starts_with("224.") && !ip.starts_with("255.") && !ip.starts_with("127.") && !ip.starts_with("239.") && !ip.starts_with("169.254.") &&
    mac != "00:00:00:00:00:00" && mac != "FF:FF:FF:FF:FF:FF" && mac.len() == 17
}

fn get_arp_table() -> HashMap<String, String> {
    let mut devices = HashMap::new();
    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("arp").arg("-a").output() {
            let re = Regex::new(r"([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s+([0-9a-fA-F:-]{17})").unwrap();
            for cap in re.captures_iter(&String::from_utf8_lossy(&output.stdout)) {
                let ip = cap[1].to_string(); let mac = cap[2].replace("-", ":").to_uppercase();
                if is_valid_host(&ip, &mac) { devices.insert(ip, mac); }
            }
        }
    } else {
        if let Ok(output) = Command::new("ip").arg("neigh").output() {
            let re = Regex::new(r"([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+).*lladdr\s+([0-9a-fA-F:]+)").unwrap();
            for cap in re.captures_iter(&String::from_utf8_lossy(&output.stdout)) {
                let ip = cap[1].to_string(); let mac = cap[2].to_uppercase();
                if is_valid_host(&ip, &mac) { devices.insert(ip, mac); }
            }
        }
    }
    devices
}

#[derive(Clone)]
struct ScanResult {
    open_ports: Vec<u16>,
    ssh_banner: String,
    http_banner: String,
}

fn carpet_bombing_sweep(base_ip: &str) -> HashMap<String, ScanResult> {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        let _ = socket.set_broadcast(true);
        let _ = socket.send_to(&[0x00], format!("{}.255:137", base_ip)); 
        let _ = socket.send_to(&[0x00], "255.255.255.255:137");
    }

    let results = Arc::new(Mutex::new(HashMap::new()));
    let mut handles = vec![];

    for i in 1..=254 {
        let ip_str = format!("{}.{}", base_ip, i);
        let res_clone = Arc::clone(&results);
        
        handles.push(thread::spawn(move || {
            let ip_addr: IpAddr = match ip_str.parse() { Ok(ip) => ip, Err(_) => return };
            
            #[cfg(target_os = "windows")]
            let _ = Command::new("ping").args(["-n", "1", "-w", "200", &ip_str]).output();
            #[cfg(not(target_os = "windows"))]
            let _ = Command::new("ping").args(["-c", "1", "-W", "1", &ip_str]).output();

            let mut open_ports = vec![];
            let mut ssh_banner = String::new();
            let mut http_banner = String::new();
            
            let ports = [22, 53, 80, 443, 445, 548, 5000, 8080, 8443, 9100];
            for &p in &ports {
                let addr = SocketAddr::new(ip_addr, p);
                if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(200)) {
                    open_ports.push(p);
                    let _ = stream.set_read_timeout(Some(Duration::from_millis(100)));
                    
                    if p == 22 {
                        let mut buf = [0; 64];
                        if let Ok(n) = stream.read(&mut buf) { ssh_banner = String::from_utf8_lossy(&buf[..n]).to_string().to_lowercase(); }
                    } else if p == 80 || p == 8080 {
                        let _ = stream.write_all(b"HEAD / HTTP/1.0\r\n\r\n");
                        let mut buf = [0; 128];
                        if let Ok(n) = stream.read(&mut buf) {
                            for line in String::from_utf8_lossy(&buf[..n]).to_lowercase().lines() {
                                if line.starts_with("server:") { http_banner = line.to_string(); break; }
                            }
                        }
                    }
                }
            }

            if !open_ports.is_empty() || !ssh_banner.is_empty() || !http_banner.is_empty() {
                let mut map = res_clone.lock().unwrap();
                map.insert(ip_str, ScanResult { open_ports, ssh_banner, http_banner });
            }
        }));
    }
    
    for h in handles { let _ = h.join(); }
    
    results.lock().unwrap().clone()
}

fn is_randomized_mac(mac: &str) -> bool {
    if mac.len() >= 17 {
        if let Some(c) = mac.chars().nth(1) {
            let c = c.to_ascii_uppercase();
            return c == '2' || c == '6' || c == 'A' || c == 'E';
        }
    }
    false
}

fn get_vendor_from_mac(mac: &str) -> String {
    if is_randomized_mac(mac) { return "Private MAC (Randomized)".to_string(); }

    let prefix = if mac.len() >= 8 { &mac[0..8] } else { "" }.to_uppercase();
    match prefix.as_str() {
        "00:00:0C" | "00:01:42" | "00:01:43" | "00:01:96" | "00:02:B9" | "00:06:28" | "00:09:B7" => "Cisco",
        "00:A0:DE" => "YAMAHA",
        "00:00:23" | "00:09:0F" | "08:5B:0E" | "90:6C:AC" => "Fortinet",
        "00:1B:17" | "08:30:6B" => "PaloAlto",
        "00:90:69" | "00:0B:86" => "Aruba",
        "00:04:DD" | "00:0D:B9" | "00:18:0A" => "Cisco Meraki",
        "00:14:69" | "00:19:E3" | "00:23:33" | "B0:7F:B9" | "CC:4E:24" => "Allied Telesis",
        "00:0F:53" | "00:14:BF" | "00:1D:B5" | "00:21:F6" | "00:24:B2" | "00:26:F2" | "28:C6:8E" => "Netgear",
        "00:00:4C" | "00:03:00" | "00:0E:58" | "00:10:E4" | "00:12:E4" | "00:14:8B" | "00:19:FA" | "00:1C:12" | "00:1D:73" | "00:22:3A" | "00:25:3E" | "00:26:87" | "00:33:3A" | "00:3A:9A" | "00:50:C2" | "04:8E:B2" | "08:B0:DF" | "18:18:1E" | "1C:B1:7F" | "30:D6:C9" | "34:11:0B" | "4C:82:A9" | "58:20:B1" | "74:03:1A" | "74:9C:E3" | "88:83:22" | "98:F1:99" | "B0:C7:45" | "BC:5C:4C" | "C0:A0:BB" | "C4:B4:42" | "CC:E1:D5" | "D4:FA:33" | "E0:F8:47" | "E4:05:46" | "E4:B2:FB" => "NEC",
        "00:0A:79" | "00:11:F4" | "00:90:3A" | "00:90:A5" | "04:AB:18" | "08:10:76" | "0C:C4:7A" | "1C:FA:68" | "20:F4:78" | "2C:2C:9E" | "30:05:5C" | "30:F7:72" | "34:A7:28" | "4C:32:75" | "50:B8:28" | "5C:E2:8C" | "60:71:0D" | "70:D2:1C" | "74:EE:2A" | "80:54:1F" | "84:A8:E4" | "84:FC:FE" | "8C:5B:F0" | "8C:F4:60" | "94:05:42" | "9C:A2:F4" | "9C:F5:F4" | "AC:5D:10" | "B4:3E:99" | "C8:51:7A" | "D8:FA:CE" | "E0:4E:91" | "E0:5B:70" | "E0:5C:E5" | "F8:32:E4" => "ELECOM",
        "00:A0:B0" | "14:52:DF" | "34:02:86" | "80:EE:73" | "8C:1F:64" | "A0:11:D3" | "CC:1A:FA" | "CC:9C:C7" | "D8:A9:8B" => "IODATA",
        "00:0D:0B" | "00:25:36" | "00:1E:8C" | "F4:F2:6D" | "10:6F:3F" | "4C:E6:76" => "Buffalo",
        "00:0A:EB" | "00:1D:0F" | "00:25:86" | "00:50:BA" | "0C:80:63" | "10:FE:ED" | "14:A7:8B" | "14:CC:20" | "18:A6:F7" | "18:D6:C7" | "28:EE:52" | "30:B5:C2" | "34:E8:94" | "4C:11:AE" | "50:C7:BF" | "54:AF:97" | "54:E6:FC" | "5C:A6:E6" | "60:38:E0" | "60:A4:B7" | "60:E3:27" | "64:56:01" | "68:FF:7B" | "7C:8B:CA" | "90:F6:52" | "98:DA:C4" | "A4:2B:B0" | "AC:84:C6" | "B0:4E:26" | "C0:06:C3" | "C0:25:E9" | "C4:E5:32" | "D8:0D:17" | "E4:D3:32" | "E8:4D:D0" | "EC:08:6B" | "F4:3E:61" | "F8:1A:67" | "F8:8E:85" | "FC:D7:33" => "TP-Link",
        "00:0C:6E" | "00:11:2F" | "00:15:F2" | "00:1B:FC" | "00:22:15" | "00:23:54" | "00:24:8C" | "00:26:18" | "04:42:1A" | "04:9F:CA" | "08:60:6E" | "08:62:66" | "10:7B:44" | "10:C3:7B" | "14:DD:A9" | "1C:B7:2C" | "2C:4D:54" | "2C:56:DC" | "30:5A:3A" | "38:D5:47" | "40:16:7E" | "4C:ED:DE" | "50:46:5D" | "50:E0:85" | "54:04:A6" | "54:A0:50" | "60:A4:4C" | "70:4D:7B" | "74:D0:2B" | "78:24:AF" | "88:D7:F6" | "90:E6:BA" | "9C:5C:8E" | "A8:5E:45" | "AC:22:0B" | "AC:9E:17" | "BC:EE:7B" | "C8:60:00" | "D8:50:E6" | "E0:3F:49" | "E0:CB:4E" | "E4:04:39" | "F0:79:59" | "F0:D1:A9" | "F4:6A:14" | "FC:34:97" => "ASUS",
        "00:50:56" | "00:0C:29" | "00:05:69" | "00:1C:14" => "VMware",
        "08:00:27" => "VirtualBox",
        "00:15:5D" => "Hyper-V",
        "B8:27:EB" | "DC:A6:32" | "E4:5F:01" | "D8:3A:DD" => "RaspberryPi",
        "00:11:32" | "00:25:9C" => "Synology",
        "00:00:85" | "00:01:E6" | "00:04:76" | "00:0B:46" | "00:1E:8F" => "Canon",
        "00:00:48" | "00:26:73" | "00:26:86" | "00:08:1B" | "00:00:74" => "Epson",
        "00:80:77" | "3C:2A:F4" | "80:1F:02" => "Brother",
        "00:16:CB" | "00:17:F2" | "00:19:B8" | "00:1A:E8" | "00:1C:B3" | "00:1D:4F" | "F4:0F:24" | "FC:FC:48" | "8C:85:90" => "Apple",
        "00:09:DD" | "00:1A:1E" | "00:1D:25" | "00:1E:7D" | "00:21:19" => "Samsung",
        "00:1A:11" | "D4:F5:47" | "28:18:78" | "F8:8F:CA" => "Google",
        "00:09:BF" | "00:16:56" | "00:17:AB" | "00:19:FD" | "00:1B:7A" | "00:22:D7" | "00:25:A0" | "04:03:D6" | "98:B6:E9" => "Nintendo",
        "00:01:4A" | "00:04:19" | "00:13:A9" | "00:19:C5" | "00:24:BE" | "08:00:46" => "Sony",
        _ => "Unknown",
    }.to_string()
}

fn infer_device_type(mac: &str, scan_res: Option<&ScanResult>, is_gateway: bool) -> (String, String, String) {
    let vendor = get_vendor_from_mac(mac);
    let v = vendor.as_str();
    
    let (ports, s_ban, h_ban) = if let Some(res) = scan_res {
        (res.open_ports.as_slice(), res.ssh_banner.as_str(), res.http_banner.as_str())
    } else {
        (&[] as &[u16], "", "")
    };

    let mut dtype = "PC".to_string();
    let mut os = "Unknown".to_string();

    if is_randomized_mac(mac) {
        dtype = "スマホ".to_string();
        os = "iOS/Android (Private MAC)".to_string();
    } else {
        if v == "Apple" { os = "macOS / iOS".to_string(); }
        else if v == "Samsung" || v == "Google" { os = "Android".to_string(); }
        else if v == "Nintendo" || v == "Sony" { os = "Game Console".to_string(); dtype = "スマホ".to_string(); }
        else if ports.contains(&445) || ports.contains(&3389) || ports.contains(&135) { os = "Windows".to_string(); }
        else if ports.contains(&22) || s_ban.contains("ubuntu") || s_ban.contains("debian") || s_ban.contains("linux") { os = "Linux".to_string(); }
        else if v == "Synology" { os = "DSM (Linux)".to_string(); dtype = "サーバー".to_string(); }
        else if v == "RaspberryPi" { os = "Raspberry Pi OS".to_string(); dtype = "サーバー".to_string(); }
        else if v == "VMware" { os = "ESXi / Linux".to_string(); dtype = "VM".to_string(); }
        else if v == "NEC" || v == "ELECOM" || v == "Buffalo" || v == "IODATA" || v == "ASUS" || v == "TP-Link" { os = "Embedded OS".to_string(); dtype = "Wi-Fi".to_string(); }
    }

    if is_gateway {
        if v == "Fortinet" || v == "PaloAlto" || h_ban.contains("forti") || s_ban.contains("forti") || h_ban.contains("palo") {
            return ("FW".to_string(), vendor, "FortiOS/PAN-OS".to_string());
        }
        return ("ルーター".to_string(), vendor, os);
    }

    if dtype != "PC" { return (dtype, vendor, os); }

    if v == "Aruba" || v == "Cisco Meraki" || ports.contains(&8443) { return ("Wi-Fi".to_string(), vendor, os); }
    if v == "Apple" || v == "Samsung" || v == "Google" { return ("スマホ".to_string(), vendor, os); }
    if ports.contains(&9100) || ports.contains(&631) || v == "Canon" || v == "Epson" || v == "Brother" { return ("PC".to_string(), vendor, "Printer OS".to_string()); }

    if v == "Cisco" || v == "YAMAHA" || v == "Allied Telesis" || v == "Netgear" {
        if ports.contains(&22) || ports.contains(&80) || ports.contains(&443) { return ("L3SW".to_string(), vendor, "Switch OS".to_string()); }
        return ("スイッチ".to_string(), vendor, "Switch OS".to_string());
    }

    if ports.contains(&5000) || h_ban.contains("qnap") { return ("サーバー".to_string(), vendor, os); }
    if ports.contains(&445) || ports.contains(&3389) || ports.contains(&135) || ports.contains(&139) || ports.contains(&548) { return ("PC".to_string(), vendor, os); }

    ("PC".to_string(), vendor, os)
}

#[tauri::command]
async fn scan_network() -> Result<Value, String> {
    let gateway_ip = get_default_gateway().unwrap_or_else(|| "192.168.1.1".to_string());
    let base_ip = gateway_ip.split('.').take(3).collect::<Vec<_>>().join(".");

    let mut arp_table_merged = HashMap::new();
    arp_table_merged.extend(get_arp_table());

    let scan_results = carpet_bombing_sweep(&base_ip);
    
    arp_table_merged.extend(get_arp_table());
    thread::sleep(Duration::from_millis(1500));
    arp_table_merged.extend(get_arp_table());

    let (local_ip, local_mac) = get_local_info(&gateway_ip);
    if !local_ip.is_empty() && !arp_table_merged.contains_key(&local_ip) {
        arp_table_merged.insert(local_ip.clone(), local_mac.clone());
    }

    let mut classified_devices = vec![];
    let mut gateway_mac = "自動取得".to_string();
    let mut gateway_type = "ルーター".to_string();
    let mut gateway_os = "Router OS".to_string();

    for (ip, mac) in arp_table_merged {
        let is_gw = ip == gateway_ip;
        let scan_res = scan_results.get(&ip); 
        let (dtype, vendor, os) = infer_device_type(&mac, scan_res, is_gw);

        if is_gw {
            gateway_mac = mac;
            gateway_type = dtype;
            gateway_os = os;
        } else {
            classified_devices.push((ip, mac, dtype, vendor, os));
        }
    }

    classified_devices.sort_by(|a, b| {
        let a_ip: Vec<u8> = a.0.split('.').filter_map(|s| s.parse().ok()).collect();
        let b_ip: Vec<u8> = b.0.split('.').filter_map(|s| s.parse().ok()).collect();
        a_ip.cmp(&b_ip)
    });

    let mut nodes = vec![
        json!({ "id": "internet", "type": "device", "position": { "x": 350, "y": 0 }, "data": { "deviceType": "クラウド", "label": "インターネット", "ip": "", "mac": "", "vendor": "Internet", "os": "Cloud" } }),
        json!({ "id": "gateway", "type": "device", "position": { "x": 350, "y": 150 }, "data": { "deviceType": gateway_type.clone(), "label": format!("ゲートウェイ ({})", gateway_type), "ip": gateway_ip, "mac": gateway_mac, "vendor": "Gateway", "os": gateway_os } }),
    ];
    let mut edges = vec![
        json!({ "id": "e-internet-gw", "source": "internet", "target": "gateway", "animated": true, "style": { "stroke": "#ef4444", "strokeWidth": 5 } }),
    ];

    let mut switches = vec![];
    let mut endpoints = vec![];
    for dev in classified_devices {
        if dev.2 == "L3SW" || dev.2 == "スイッチ" { switches.push(dev); } else { endpoints.push(dev); }
    }

    let max_cols = if switches.is_empty() { 4 } else { switches.len().max(1) * 3 };
    let subnet_width = 150.0 + (max_cols as f64 * 180.0);
    let subnet_height = 200.0 + (((endpoints.len() / max_cols) + 1) as f64 * 180.0);

    nodes.push(json!({ "id": "subnet", "type": "subnet", "position": { "x": 50, "y": 320 }, "data": { "label": format!("検出ネットワーク ({}.0/24)", base_ip), "cidr": "/24" }, "style": { "width": subnet_width, "height": subnet_height }, "zIndex": -1 }));

    let mut switch_ids = vec![];
    
    for (i, (ip, mac, dtype, vendor, os)) in switches.iter().enumerate() {
        let node_id = format!("sw-{}", i);
        let x = 100.0 + (i as f64 * 350.0); 
        let y = 50.0;
        nodes.push(json!({ "id": node_id.clone(), "type": "device", "position": { "x": x, "y": y }, "data": { "deviceType": dtype, "label": format!("{} {}", dtype, i+1), "ip": ip, "mac": mac, "vendor": vendor, "os": os }, "parentId": "subnet", "extent": "parent" }));
        edges.push(json!({ "id": format!("e-gw-{}", node_id), "source": "gateway", "target": node_id.clone(), "animated": true, "style": { "stroke": "#f59e0b", "strokeWidth": 4 } }));
        switch_ids.push(node_id);
    }

    for (i, (ip, mac, dtype, vendor, os)) in endpoints.iter().enumerate() {
        let node_id = format!("dev-{}", i);
        let col = i % max_cols;
        let row = i / max_cols;
        let start_x = 40.0 + (col as f64 * 180.0);
        let start_y = if switch_ids.is_empty() { 70.0 + (row as f64 * 150.0) } else { 220.0 + (row as f64 * 150.0) };

        let mut final_label = format!("{} {}", dtype, i+1);
        if ip == &local_ip {
            final_label = format!("⭐ {} (このPC)", dtype);
        }

        nodes.push(json!({ "id": node_id.clone(), "type": "device", "position": { "x": start_x, "y": start_y }, "data": { "deviceType": dtype, "label": final_label, "ip": ip, "mac": mac, "vendor": vendor, "os": os }, "parentId": "subnet", "extent": "parent" }));
        
        let parent_link = if !switch_ids.is_empty() { &switch_ids[i % switch_ids.len()] } else { "gateway" };
        edges.push(json!({ "id": format!("e-{}-{}", parent_link, node_id), "source": parent_link, "target": node_id.clone(), "animated": true, "type": "smoothstep" }));
    }

    Ok(json!({ "nodes": nodes, "edges": edges }))
}

// =====================================================================
// 🌟 実装部: フロントエンドから設定を受け取る構造体とデータ取得
// =====================================================================
#[derive(Deserialize)]
struct FetchTarget {
    id: String,
    ip: String,
}

// UIから渡されるZabbix設定
#[derive(Deserialize)]
#[allow(dead_code)]
struct ZabbixConfig {
    url: String,
    token: String,
}

#[tauri::command]
async fn fetch_real_metrics(targets: Vec<FetchTarget>, _zabbix_config: Option<ZabbixConfig>) -> Result<Value, String> {
    let mut results = serde_json::Map::new();

    // 🌟 Zabbix設定がUIで入力されている場合のみ、ここでAPIリクエストを発行する
    // if let Some(config) = &zabbix_config {
    //     let client = reqwest::Client::new();
    //     // config.url と config.token を使用してZabbix APIを呼び出す処理
    // }

    for target in targets {
        let ip = target.ip.clone();
        
        // 1. OSネイティブのPingコマンドを実行して応答速度を取得
        let ping_time = if cfg!(target_os = "windows") {
            if let Ok(output) = Command::new("ping").args(["-n", "1", "-w", "500", &ip]).output() {
                let out_str = String::from_utf8_lossy(&output.stdout);
                if let Some(caps) = Regex::new(r"時間(?:=|<=|<)([0-9]+)ms").unwrap().captures(&out_str) {
                    caps[1].parse::<u32>().ok()
                } else { None }
            } else { None }
        } else {
            if let Ok(output) = Command::new("ping").args(["-c", "1", "-W", "1", &ip]).output() {
                let out_str = String::from_utf8_lossy(&output.stdout);
                if let Some(caps) = Regex::new(r"time=([0-9\.]+) ms").unwrap().captures(&out_str) {
                    caps[1].parse::<f32>().map(|f| f.round() as u32).ok()
                } else { None }
            } else { None }
        };

        // 2. ダミーデータ (Zabbix API実装後に置き換えます)
        let cpu: Option<u32> = None;
        let temp: Option<u32> = None;

        if let Some(p) = ping_time {
            let mut device_metric = json!({
                "ping": p
            });
            
            if let Some(c) = cpu { device_metric["cpu"] = json!(c); }
            if let Some(t) = temp { device_metric["temp"] = json!(t); }

            results.insert(target.id, device_metric);
        }
    }

    Ok(Value::Object(results))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            scan_network,
            launch_native_terminal,
            fetch_real_metrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}