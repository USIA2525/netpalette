import React, { useState, useRef } from 'react';
// 🌟 修正: Cloud, Server, Database, Box, Code などAWS・Terraform関連アイコンを追加
import { Server, Monitor, Smartphone, Router, Network, BoxSelect, Cloud, Trash2, Search, Lock, Unlock, Zap, Moon, FileText, ShieldAlert, X, FileDown, Shield, Database, Layers, Wifi, Terminal, BookOpen, Computer, Box, Upload, Type, Square, Activity, Battery, ChevronDown, Clock, Code } from 'lucide-react';
import { calculateSubnet, generateSimulatorTable } from '../utils/subnetCalc';
import { exportToYAML, exportToDrawio, exportToMarkdown } from '../utils/exportUtils';
import { exportToKubernetesYAML, exportToDockerCompose } from '../utils/manifestGenerator';
import { exportToTerraform } from '../utils/terraformGenerator'; // 🌟 追加: Terraform生成ユーティリティをインポート
import DictionaryModal from './DictionaryModal';
import { AppNode, AppEdge } from '../types'; 

type SidebarProps = {
  onExport: (format: 'png' | 'pdf') => void;
  updateNodeData: (id: string | string[], newData: Record<string, unknown>) => void;
  updateEdgeData: (id: string, newData: Record<string, unknown>) => void; 
  nodes: AppNode[]; edges: AppEdge[]; 
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
  deleteNode: (id: string | string[]) => void;
  deleteEdge: (id: string) => void; 
  isLocked: boolean; setIsLocked: (l: boolean) => void;
  searchQuery: string; setSearchQuery: (q: string) => void;
  isDarkMode: boolean; setIsDarkMode: (d: boolean) => void;
};

let idCounter = 100;
const getNewId = () => `node_new_${idCounter++}`;

export default function Sidebar({ onExport, updateNodeData, updateEdgeData, nodes, edges, setNodes, deleteNode, deleteEdge, isLocked, setIsLocked, searchQuery, setSearchQuery, isDarkMode, setIsDarkMode }: SidebarProps) {
  
  const [isDictOpen, setIsDictOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUpsPanelOpen, setIsUpsPanelOpen] = useState(false);
  const [upsWattLimit, setUpsWattLimit] = useState(900);
  const [upsBatteryWh, setUpsBatteryWh] = useState(132);

  const selectedNodes = nodes.filter(n => n.selected);
  const singleSelectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const selectedEdges = edges.filter(e => e.selected);
  const singleSelectedEdge = selectedEdges.length === 1 && selectedNodes.length === 0 ? selectedEdges[0] : null;

  const onClickAdd = (itemType: string) => {
    if (isLocked) return;
    const randomOffset = Math.floor(Math.random() * 50);
    const position = { x: 150 + randomOffset, y: 150 + randomOffset };

    // 🌟 修正: 'AWS VPC' もサブネットと同じ扱いにする
    if (itemType === 'subnet' || itemType === 'AWS VPC') {
      setNodes((nds) => nds.concat({ id: getNewId(), type: 'subnet', position, style: { width: 450, height: 280 }, data: { label: `新規${itemType}`, cidr: '/24', deviceType: itemType, isDarkMode }, zIndex: -1 }));
      return;
    }
    if (itemType === 'area') {
      setNodes((nds) => nds.concat({ id: getNewId(), type: 'area', position, style: { width: 300, height: 200 }, data: { label: '新規エリア', color: '#3b82f6' }, zIndex: -2 }));
      return;
    }
    if (itemType === 'text') {
      setNodes((nds) => nds.concat({ id: getNewId(), type: 'text', position, data: { label: 'テキスト', fontSize: 14, color: isDarkMode ? '#e2e8f0' : '#1e293b' }, zIndex: 10 }));
      return;
    }
    
    let defaultPower = 30;
    if (itemType === 'サーバー' || itemType === 'DB' || itemType === 'AWS EC2' || itemType === 'AWS RDS') defaultPower = 150;
    else if (itemType === 'ルーター' || itemType === 'L3SW' || itemType === 'FW') defaultPower = 45;
    else if (itemType === 'スイッチ' || itemType === 'Wi-Fi') defaultPower = 15;
    else if (itemType === 'スマホ') defaultPower = 5;
    else if (itemType === 'VM' || itemType === 'コンテナ') defaultPower = 10;
    
    setNodes((nds) => nds.concat({
      id: getNewId(), type: 'device', position,
      data: { deviceType: itemType, label: `新規${itemType}`, ip: '192.168.1.xxx', mac: '00:00:00:00:00:00', power: defaultPower, isDarkMode, routingTable: [], acl: [], customIcon: null },
    }));
  };

  const onDragStart = (event: React.DragEvent, nodeType: string, deviceType?: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    if (deviceType) event.dataTransfer.setData('application/devicetype', deviceType);
    event.dataTransfer.effectAllowed = 'move';
    (window as any).draggedItem = { type: nodeType, deviceType };
  };

  const runSecurityAudit = () => {
    let warningCount = 0;
    const newNodes = nodes.map(node => {
      let warning = null;
      if (node.type === 'device' && !['ルーター', 'FW', 'L3SW', 'クラウド'].includes(node.data.deviceType as string)) {
        const isDirectlyConnectedToCloud = edges.some(e => {
          if (e.source === node.id || e.target === node.id) {
            const otherId = e.source === node.id ? e.target : e.source;
            const otherNode = nodes.find(n => n.id === otherId);
            return otherNode?.data?.deviceType === 'クラウド';
          } return false;
        });
        if (isDirectlyConnectedToCloud) { warning = '⚠️ 危険: インターネットに直接接続されています！FWやルーターを間に配置してください。'; warningCount++; }
      }
      return { ...node, data: { ...node.data, auditWarning: warning } };
    });
    setNodes(newNodes);
    if (warningCount > 0) alert(`🛡️ 監査完了: ${warningCount}件のセキュリティリスクを発見しました。`);
    else alert('🛡️ 監査完了: 重大なセキュリティリスクは見つかりませんでした！');
  };

  const applyDHCP = () => {
    if (!singleSelectedNode || singleSelectedNode.type !== 'subnet') return;
    const cidrStr = singleSelectedNode.data.cidr as string || '/24';
    let baseIp = '192.168.1';
    if (cidrStr.includes('.')) baseIp = cidrStr.split('/')[0].split('.').slice(0, 3).join('.');
    
    setNodes(nds => {
        let ipCounter = 2; 
        return nds.map(n => {
            if (n.parentId === singleSelectedNode.id && n.type === 'device') {
                return { ...n, data: { ...n.data, ip: `${baseIp}.${ipCounter++}` } };
            }
            return n;
        });
    });
    alert('⚡ DHCPシミュレーション: サブネット内のデバイスにIPを自動割り当てしました！');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !singleSelectedNode) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) updateNodeData(singleSelectedNode.id, { customIcon: event.target.result as string });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };

  const handleRemoveImage = () => {
    if (!singleSelectedNode) return;
    updateNodeData(singleSelectedNode.id, { customIcon: null });
  };

  const bgSidebar = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const bgPanel = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const textTitle = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textLabel = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const inputBg = isDarkMode ? 'bg-slate-950 border-slate-700 text-slate-100 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500';

  let connectedCount = 0; let simTable: ReturnType<typeof generateSimulatorTable> = []; let currentSim = null;
  if (singleSelectedNode?.type === 'subnet') {
    connectedCount = nodes.filter(n => n.parentId === singleSelectedNode.id && n.type === 'device').length;
    simTable = generateSimulatorTable('192.168.1', connectedCount);
    currentSim = calculateSubnet(singleSelectedNode.data.cidr as string, '192.168.1');
  }

  // 🌟 修正: AWSクラウド機器をパレットに追加
  const devicePalette = [
    {type:'ルーター', i:Router}, {type:'L3SW', i:Layers}, {type:'スイッチ', i:Network}, {type:'FW', i:Shield}, {type:'Wi-Fi', i:Wifi},
    {type:'PC', i:Monitor}, {type:'サーバー', i:Server}, {type:'DB', i:Database}, {type:'スマホ', i:Smartphone}, {type:'クラウド', i:Cloud},
    {type:'VM', i:Computer}, {type:'コンテナ', i:Box}, 
    {type:'AWS VPC', i:Cloud}, {type:'AWS EC2', i:Server}, {type:'AWS RDS', i:Database}, {type:'AWS S3', i:Box}
  ];

  const totalPower = nodes.reduce((sum, n) => sum + (Number(n.data?.power) || 0), 0);
  const loadRatio = upsWattLimit > 0 ? (totalPower / upsWattLimit) * 100 : 0;
  const isOverload = totalPower > upsWattLimit;
  const estimatedRuntimeMin = totalPower > 0 ? Math.floor(((upsBatteryWh * 0.85) / totalPower) * 60) : 0;

  return (
    <>
      <datalist id="power-presets">
        <option value="142">Ryzen 9 5900X</option>
        <option value="40">Synology NAS</option>
        <option value="10">Raspberry Pi 5</option>
        <option value="25">マネージド L3スイッチ</option>
      </datalist>

      <aside className={`w-[450px] border-l flex flex-col shadow-xl z-10 overflow-hidden transition-colors duration-300 ${bgSidebar}`}>
        
        <div className={`p-3 border-b flex gap-2 items-center ${bgPanel}`}>
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input type="text" placeholder="名前やIPで検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={`w-full pl-8 pr-3 py-1.5 text-sm border rounded-md outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow ${inputBg}`} />
          </div>
          <button onClick={() => setIsDictOpen(true)} className={`p-1.5 rounded-md border transition-colors ${isDarkMode ? 'bg-slate-700 border-slate-600 text-blue-400 hover:bg-slate-600' : 'bg-slate-50 text-blue-600 border-slate-200 hover:bg-slate-100'}`} title="ネットワーク辞書を開く"><BookOpen size={16}/></button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-1.5 rounded-md border transition-colors ${isDarkMode ? 'bg-slate-700 border-slate-600 text-yellow-400 hover:bg-slate-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`} title="ダークモード切替"><Moon size={16}/></button>
          <button onClick={() => setIsLocked(!isLocked)} className={`p-1.5 rounded-md border transition-colors ${isLocked ? 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20' : isDarkMode ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`} title="編集ロック">
            {isLocked ? <Lock size={16}/> : <Unlock size={16}/>}
          </button>
        </div>

        <div className={`p-4 border-b shadow-sm ${bgPanel} ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
          <h3 className={`text-[10px] font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>注釈ツール (クリック)</h3>
          <div className="flex gap-2 mb-4">
            <div onClick={() => onClickAdd('text')} onDragStart={(e) => onDragStart(e, 'text')} draggable className={`flex-1 p-2 border rounded cursor-grab hover:cursor-pointer flex items-center justify-center gap-1 text-xs font-bold transition-colors ${isDarkMode ? 'border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}><Type size={14}/> テキスト</div>
            <div onClick={() => onClickAdd('area')} onDragStart={(e) => onDragStart(e, 'area')} draggable className={`flex-1 p-2 border rounded cursor-grab hover:cursor-pointer flex items-center justify-center gap-1 text-xs font-bold transition-colors ${isDarkMode ? 'border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}><Square size={14}/> エリア枠</div>
            <div onClick={() => onClickAdd('subnet')} onDragStart={(e) => onDragStart(e, 'subnet')} draggable className={`flex-1 p-2 border-2 border-dashed rounded cursor-grab hover:cursor-pointer flex items-center justify-center gap-1 text-xs font-bold transition-colors ${isDarkMode ? 'border-blue-500 bg-blue-900/40 text-blue-300 hover:bg-blue-900/60' : 'border-blue-400 bg-blue-50 text-blue-600 hover:bg-blue-100'}`}><BoxSelect size={14}/> サブネット</div>
          </div>
          
          <h3 className={`text-[10px] font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>デバイス (クリック)</h3>
          <div className="grid grid-cols-6 gap-2">
            {devicePalette.map((dev) => (
              <div key={dev.type} onDragStart={(e) => onDragStart(e, 'device', dev.type)} onClick={() => onClickAdd(dev.type)} draggable className={`border rounded-xl p-2 flex flex-col items-center cursor-grab hover:cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${isDarkMode ? 'bg-slate-800 border-slate-500 hover:border-slate-400 hover:bg-slate-700' : 'bg-white border-slate-200 hover:border-blue-400'}`}>
                {/* 🌟 修正: AWS系デバイスはオレンジ色で目立たせる */}
                <dev.i size={18} className={`mb-1 ${dev.type.includes('AWS') ? 'text-orange-500' : dev.type === 'クラウド' ? (isDarkMode ? 'text-blue-400' : 'text-blue-500') : dev.type === 'FW' ? (isDarkMode ? 'text-orange-400' : 'text-orange-500') : dev.type === 'VM' || dev.type === 'コンテナ' ? (isDarkMode ? 'text-purple-400' : 'text-purple-500') : isDarkMode ? 'text-slate-200' : 'text-slate-700'}`} />
                <span className={`text-[8px] font-bold whitespace-nowrap overflow-hidden w-full text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{dev.type}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {/* ... (既存の回線設定やプロパティ編集部分は変更なし) ... */}
          <p className="text-xs text-slate-500 mb-4">※デバイスをダブルクリックするとCLIターミナルが開きます！</p>
          
          {singleSelectedEdge && !isLocked && (
             <div className={`rounded-xl border shadow-sm p-4 mb-4 ${bgPanel}`}>
               <h3 className={`font-bold text-sm border-b pb-2 mb-4 flex items-center gap-2 ${textTitle}`}><Activity size={16}/> 回線設定</h3>
               <div className="space-y-4">
                 <div>
                   <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>回線状態</label>
                   <select value={(singleSelectedEdge.data?.status as string) || 'up'} onChange={e => updateEdgeData(singleSelectedEdge.id, { status: e.target.value })} className={`w-full p-2.5 text-sm border rounded font-bold ${singleSelectedEdge.data?.status === 'down' ? 'text-red-500' : 'text-green-500'} ${inputBg}`}>
                     <option value="up">🟢 Link UP (正常)</option>
                     <option value="down">🔴 Link DOWN (断線)</option>
                   </select>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>送信元 I/F</label>
                     <input type="text" placeholder="例: Gi0/1" value={(singleSelectedEdge.data?.sourceIf as string) || ''} onChange={e => updateEdgeData(singleSelectedEdge.id, { sourceIf: e.target.value })} className={`w-full px-2 py-1.5 border rounded text-xs font-mono ${inputBg}`} />
                   </div>
                   <div>
                     <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>宛先 I/F</label>
                     <input type="text" placeholder="例: Eth1" value={(singleSelectedEdge.data?.targetIf as string) || ''} onChange={e => updateEdgeData(singleSelectedEdge.id, { targetIf: e.target.value })} className={`w-full px-2 py-1.5 border rounded text-xs font-mono ${inputBg}`} />
                   </div>
                 </div>
                 <button onClick={() => deleteEdge(singleSelectedEdge.id)} className={`w-full mt-4 py-2 text-xs font-bold rounded border transition-colors ${isDarkMode ? 'bg-red-900/30 text-red-400 border-red-900/50 hover:bg-red-900/50' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}>回線を削除</button>
               </div>
             </div>
          )}

          {selectedNodes.length > 1 && !isLocked && (
            <div className={`rounded-xl border shadow-sm p-4 mb-4 ${bgPanel}`}>
              <h3 className={`font-bold mb-4 text-sm border-b pb-2 ${isDarkMode ? 'border-slate-700' : ''} ${textTitle}`}>📦 一括編集 ({selectedNodes.length}アイテム)</h3>
              <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>VLAN ID</label>
              <input type="number" placeholder="例: 10" onChange={(e) => updateNodeData(selectedNodes.map(n => n.id), { vlan: e.target.value })} className={`w-full px-2 py-1.5 border rounded-md font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} />
              <label className={`block text-[11px] font-bold mt-3 mb-1 ${textLabel}`}>消費電力 (W)</label>
              <input type="number" list="power-presets" placeholder="例: 142" onChange={(e) => updateNodeData(selectedNodes.map(n => n.id), { power: Number(e.target.value) })} className={`w-full px-2 py-1.5 border rounded-md font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} />
              <button onClick={() => deleteNode(selectedNodes.map(n => n.id))} className={`mt-5 w-full transition-colors text-xs py-2 rounded-md flex items-center justify-center gap-1.5 font-bold ${isDarkMode ? 'bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50' : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'}`}><Trash2 size={14} />選択したアイテムを削除</button>
            </div>
          )}

          {singleSelectedNode && !isLocked && (
            <div className={`rounded-xl border shadow-sm p-4 mb-4 ${bgPanel}`}>
              <h3 className={`font-bold mb-4 text-sm border-b pb-2 ${isDarkMode ? 'border-slate-700' : ''} ${textTitle}`}>
                設定 ({singleSelectedNode.type === 'device' ? singleSelectedNode.data.deviceType as string : singleSelectedNode.type === 'subnet' ? 'サブネット' : singleSelectedNode.type === 'area' ? 'エリア枠' : 'テキスト'})
              </h3>
              
              <div className="space-y-4">
                {(singleSelectedNode.type === 'text' || singleSelectedNode.type === 'area') && (
                  <>
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>テキスト内容</label>
                      <textarea value={singleSelectedNode.data.label as string} onChange={e => updateNodeData(singleSelectedNode.id, { label: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>カラー</label>
                        <input type="color" value={(singleSelectedNode.data.color as string) || '#3b82f6'} onChange={e => updateNodeData(singleSelectedNode.id, { color: e.target.value })} className="w-full h-8 rounded border p-0 cursor-pointer" />
                      </div>
                      {singleSelectedNode.type === 'text' && (
                        <div>
                          <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>フォントサイズ</label>
                          <input type="number" value={(singleSelectedNode.data.fontSize as number) || 14} onChange={e => updateNodeData(singleSelectedNode.id, { fontSize: Number(e.target.value) })} className={`w-full px-2 py-1.5 border rounded text-xs ${inputBg}`} />
                        </div>
                      )}
                    </div>
                  </>
                )}

                {(singleSelectedNode.type === 'device' || singleSelectedNode.type === 'subnet') && (
                  <div>
                    <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>表示名</label>
                    <input type="text" value={singleSelectedNode.data.label as string} onChange={(e) => updateNodeData(singleSelectedNode.id, { label: e.target.value })} className={`w-full px-2.5 py-1.5 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} />
                  </div>
                )}

                {singleSelectedNode.type === 'device' && (
                  <div>
                    <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>デバイスタイプ</label>
                    <select
                      value={(singleSelectedNode.data.deviceType as string) || 'PC'}
                      onChange={(e) => updateNodeData(singleSelectedNode.id, { deviceType: e.target.value })}
                      className={`w-full px-2.5 py-1.5 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`}
                    >
                      <option value="PC">PC</option>
                      <option value="サーバー">サーバー</option>
                      <option value="DB">DB</option>
                      <option value="スマホ">スマホ</option>
                      <option value="ルーター">ルーター</option>
                      <option value="スイッチ">スイッチ</option>
                      <option value="L3SW">L3SW</option>
                      <option value="Wi-Fi">Wi-Fi</option>
                      <option value="FW">FW</option>
                      <option value="VM">VM</option>
                      <option value="コンテナ">コンテナ</option>
                      <option value="クラウド">クラウド</option>
                      <option value="AWS VPC">AWS VPC</option>
                      <option value="AWS EC2">AWS EC2</option>
                      <option value="AWS RDS">AWS RDS</option>
                      <option value="AWS S3">AWS S3</option>
                    </select>
                  </div>
                )}

                {singleSelectedNode.type === 'device' && (
                  <div className={`pt-2 pb-1 border-y ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    <label className={`block text-[11px] font-bold mb-2 flex justify-between items-center ${textLabel}`}>カスタムアイコン画像</label>
                    {singleSelectedNode.data.customIcon ? (
                      <div className={`relative inline-flex items-center justify-center border rounded-lg p-3 w-full ${isDarkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
                        <img src={singleSelectedNode.data.customIcon as string} alt="Custom Icon" className="w-12 h-12 object-contain" />
                        <button onClick={handleRemoveImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-sm transition-colors" title="削除"><X size={12} /></button>
                      </div>
                    ) : (
                      <div>
                        <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
                        <button onClick={() => fileInputRef.current?.click()} className={`flex items-center justify-center gap-2 w-full text-xs py-2 rounded border border-dashed transition-colors ${isDarkMode ? 'border-slate-600 hover:bg-slate-700 text-slate-400' : 'border-slate-300 hover:bg-slate-100 text-slate-500'}`}><Upload size={14} /> 独自の画像をアップロード</button>
                      </div>
                    )}
                  </div>
                )}
                
                {singleSelectedNode.type === 'device' && !((singleSelectedNode.data.deviceType as string).includes('クラウド') || (singleSelectedNode.data.deviceType as string).includes('AWS')) && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>IPアドレス</label>
                        <input type="text" value={singleSelectedNode.data.ip as string} onChange={(e) => updateNodeData(singleSelectedNode.id, { ip: e.target.value })} className={`w-full px-2 py-1.5 border rounded-md font-mono text-xs outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} />
                      </div>
                      <div>
                        <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>VLAN ID</label>
                        <input type="number" value={singleSelectedNode.data.vlan as string || ''} placeholder="なし" onChange={(e) => updateNodeData(singleSelectedNode.id, { vlan: e.target.value })} className={`w-full px-2 py-1.5 border rounded-md font-mono text-xs outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-[11px] font-bold mb-1 ${textLabel}`}>MACアドレス</label>
                        <input type="text" value={singleSelectedNode.data.mac as string || '00:00:00:00:00:00'} onChange={(e) => updateNodeData(singleSelectedNode.id, { mac: e.target.value })} className={`w-full px-2 py-1.5 border rounded-md font-mono text-xs outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} />
                      </div>
                      <div>
                        <label className={`block text-[11px] font-bold mb-1 flex items-center gap-1 ${textLabel}`}><Zap size={10} className="text-yellow-500" /> 消費電力 (W)</label>
                        <input type="number" list="power-presets" value={singleSelectedNode.data.power as number || ''} placeholder="例: 142" onChange={(e) => updateNodeData(singleSelectedNode.id, { power: Number(e.target.value) })} className={`w-full px-2 py-1.5 border rounded-md font-mono text-xs outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {singleSelectedNode.type === 'device' && (singleSelectedNode.data.deviceType === 'ルーター' || singleSelectedNode.data.deviceType === 'L3SW') && (
                <div className={`mt-5 p-3 border rounded-lg ${isDarkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
                  <h4 className={`text-xs font-bold mb-3 flex items-center gap-1.5 ${textTitle}`}>🗺️ ルーティングテーブル</h4>
                  <div className="space-y-2">
                    {((singleSelectedNode.data.routingTable as any[]) || []).map((route, i) => (
                      <div key={i} className="flex gap-1.5 items-center">
                        <input type="text" placeholder="宛先(192.168.2.0/24)" value={route.dest} onChange={e => { const newRt = [...(singleSelectedNode.data.routingTable as any[])]; newRt[i].dest = e.target.value; updateNodeData(singleSelectedNode.id, { routingTable: newRt }); }} className={`w-full px-2 py-1.5 text-[10px] border rounded font-mono outline-none focus:border-blue-500 ${inputBg}`} />
                        <input type="text" placeholder="NextHop" value={route.nextHop} onChange={e => { const newRt = [...(singleSelectedNode.data.routingTable as any[])]; newRt[i].nextHop = e.target.value; updateNodeData(singleSelectedNode.id, { routingTable: newRt }); }} className={`w-full px-2 py-1.5 text-[10px] border rounded font-mono outline-none focus:border-blue-500 ${inputBg}`} />
                        <button onClick={() => { const newRt = (singleSelectedNode.data.routingTable as any[]).filter((_, idx) => idx !== i); updateNodeData(singleSelectedNode.id, { routingTable: newRt }); }} className="text-red-400 hover:text-red-600 hover:bg-red-500/20 p-1 rounded transition-colors"><X size={14}/></button>
                      </div>
                    ))}
                    <button onClick={() => { const newRt = [...((singleSelectedNode.data.routingTable as any[]) || []), { dest: '', nextHop: '' }]; updateNodeData(singleSelectedNode.id, { routingTable: newRt }); }} className={`w-full text-[11px] py-1.5 mt-1 rounded-md border border-dashed font-bold transition-colors ${isDarkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-300 text-slate-500 hover:bg-slate-200'}`}>+ 経路を追加</button>
                  </div>
                </div>
              )}

              {singleSelectedNode.type === 'device' && singleSelectedNode.data.deviceType === 'FW' && (
                <div className={`mt-5 p-3 border rounded-lg ${isDarkMode ? 'border-orange-900/50 bg-orange-950/20' : 'border-orange-200 bg-orange-50'}`}>
                  <h4 className={`text-xs font-bold mb-3 flex items-center gap-1.5 ${isDarkMode ? 'text-orange-400' : 'text-orange-700'}`}><Shield size={14}/> ACL (アクセス制御リスト)</h4>
                  <p className={`text-[9px] mb-3 leading-tight ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>※ANY以外を指定すると、通信テスト時にそのプロトコルのみ評価されます。</p>
                  <div className="space-y-3">
                    {((singleSelectedNode.data.acl as any[]) || []).map((rule, i) => (
                      <div key={i} className={`pb-3 border-b ${isDarkMode ? 'border-orange-900/30' : 'border-orange-200/50'}`}>
                        <div className="flex gap-1.5 items-center mb-1.5">
                          <input type="text" placeholder="IP (192.168.2.0/24)" value={rule.ip} onChange={e => { const newAcl = [...(singleSelectedNode.data.acl as any[])]; newAcl[i].ip = e.target.value; updateNodeData(singleSelectedNode.id, { acl: newAcl }); }} className={`w-full px-2 py-1 text-[10px] border rounded font-mono outline-none focus:border-orange-500 ${inputBg}`} />
                          <select value={rule.action} onChange={e => { const newAcl = [...(singleSelectedNode.data.acl as any[])]; newAcl[i].action = e.target.value; updateNodeData(singleSelectedNode.id, { acl: newAcl }); }} className={`px-2 py-1 text-[10px] border rounded outline-none font-bold ${rule.action === 'deny' ? 'text-red-500' : 'text-green-500'} ${inputBg}`}>
                            <option value="allow">Allow</option><option value="deny">Deny</option>
                          </select>
                          <button onClick={() => { const newAcl = (singleSelectedNode.data.acl as any[]).filter((_, idx) => idx !== i); updateNodeData(singleSelectedNode.id, { acl: newAcl }); }} className="text-red-400 hover:text-red-600 hover:bg-red-500/20 p-1 rounded transition-colors"><X size={14}/></button>
                        </div>
                        <div className="flex gap-1.5 items-center">
                          <select value={rule.protocol || 'ANY'} onChange={e => { const newAcl = [...(singleSelectedNode.data.acl as any[])]; newAcl[i].protocol = e.target.value; updateNodeData(singleSelectedNode.id, { acl: newAcl }); }} className={`flex-1 px-2 py-1 text-[10px] border rounded outline-none ${inputBg}`}>
                            <option value="ANY">ANY</option><option value="ICMP">ICMP</option><option value="TCP">TCP</option><option value="UDP">UDP</option>
                          </select>
                          <input type="text" placeholder="Port" value={rule.port || ''} disabled={rule.protocol === 'ANY' || rule.protocol === 'ICMP'} onChange={e => { const newAcl = [...(singleSelectedNode.data.acl as any[])]; newAcl[i].port = e.target.value; updateNodeData(singleSelectedNode.id, { acl: newAcl }); }} className={`w-16 px-2 py-1 text-[10px] border rounded font-mono outline-none disabled:opacity-50 ${inputBg}`} />
                        </div>
                      </div>
                    ))}
                    <button onClick={() => { const newAcl = [...((singleSelectedNode.data.acl as any[]) || []), { ip: '', action: 'deny', protocol: 'ANY', port: '' }]; updateNodeData(singleSelectedNode.id, { acl: newAcl }); }} className={`w-full text-[11px] py-1.5 mt-1 rounded-md border border-dashed font-bold transition-colors ${isDarkMode ? 'border-orange-900/50 text-orange-500 hover:bg-orange-900/30' : 'border-orange-300 text-orange-600 hover:bg-orange-100'}`}>+ ルールを追加</button>
                  </div>
                </div>
              )}

              <button onClick={() => deleteNode(singleSelectedNode.id)} className={`mt-5 w-full transition-colors text-xs py-2 rounded-md flex items-center justify-center gap-1.5 font-bold ${isDarkMode ? 'bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50' : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'}`}>
                <Trash2 size={14} />削除
              </button>
            </div>
          )}

          {singleSelectedNode?.type === 'subnet' && currentSim && (
            <div className={`mb-4 -mx-4 ${isDarkMode ? 'bg-slate-800 border-y border-slate-700' : 'bg-transparent'}`}>
               <div className="px-4 py-3 mb-2">
                  <div className="flex justify-between items-center mb-1 text-[13px]">
                     <span className={`font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>現在の設定:</span>
                     <span className={`font-mono font-black text-lg ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{singleSelectedNode.data.cidr as string}</span>
                  </div>
                  <div className="flex justify-between text-xs mb-1"><span className={textLabel}>最大ホスト数:</span><span className={`font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>{currentSim.maxHosts}台</span></div>
                  <div className="flex justify-between text-xs mb-2"><span className={textLabel}>接続中:</span><span className={`font-mono font-bold ${connectedCount > currentSim.maxHosts ? 'text-red-500' : 'text-green-500'}`}>{connectedCount}台</span></div>
                  <div className={`w-full rounded-full h-1.5 mt-2 overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                    <div className={`h-1.5 rounded-full ${connectedCount > currentSim.maxHosts ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, (connectedCount / currentSim.maxHosts) * 100)}%` }}></div>
                  </div>
                  <button onClick={applyDHCP} className="w-full mt-4 bg-blue-500 hover:bg-blue-600 transition-colors text-white text-xs py-2 rounded flex items-center justify-center gap-1.5 font-bold shadow-sm">
                    <Zap size={14}/> DHCPでIP自動割り当て
                  </button>
               </div>
               <div className="overflow-x-auto px-4 pb-4">
                 <table className={`w-full text-left text-xs whitespace-nowrap border ${isDarkMode ? 'border-slate-700 text-slate-300 bg-slate-900' : 'border-slate-200 text-slate-700 bg-white'}`}>
                   <thead className={isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}>
                     <tr><th className={`px-3 py-2 border-b font-bold ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>CIDR表記</th><th className={`px-3 py-2 border-b font-bold ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>サブネットマスク</th><th className={`px-3 py-2 border-b font-bold ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>利用可能ホスト数</th><th className={`px-3 py-2 border-b font-bold ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>IPアドレス範囲</th></tr>
                   </thead>
                   <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
                    {simTable.map((row) => (
                      <tr key={row.cidr} onClick={() => updateNodeData(singleSelectedNode.id, { cidr: row.cidr })} className={`cursor-pointer transition-colors ${singleSelectedNode.data.cidr === row.cidr ? (isDarkMode ? 'bg-blue-900/50' : 'bg-blue-50') : (isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50/50')}`}>
                        <td className={`px-3 py-3 font-bold font-mono border-r ${isDarkMode ? 'border-slate-700 text-blue-300' : 'border-slate-200'}`}>{row.cidr}</td><td className={`px-3 py-3 font-mono border-r ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>{row.subnetMask}</td><td className={`px-3 py-3 font-mono border-r ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>{row.maxHosts}台</td><td className={`px-3 py-3 font-mono border-r ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>{row.ipRange}</td>
                      </tr>
                    ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}
        </div>

        <div className={`p-4 border-t ${isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}`}>
          <button onClick={runSecurityAudit} className={`w-full mb-4 bg-transparent border transition-all text-xs py-2 rounded-md font-bold flex items-center justify-center gap-1.5 ${isDarkMode ? 'border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10' : 'border-yellow-500 text-yellow-600 hover:bg-yellow-50'}`}>
            <ShieldAlert size={14}/> セキュリティ監査
          </button>

          <div className={`border-y mb-4 ${isDarkMode ? 'border-slate-800 bg-slate-900/30' : 'border-slate-200 bg-slate-50/50'}`}>
            <div 
              onClick={() => setIsUpsPanelOpen(!isUpsPanelOpen)}
              className="px-4 py-3 flex justify-between items-center cursor-pointer transition-colors hover:opacity-80"
            >
              <span className={`text-xs font-bold flex items-center gap-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                 <Battery size={14} className={isOverload ? 'text-red-500' : 'text-green-500'}/> UPS・電源シミュレータ
              </span>
              <div className="flex items-center gap-2">
                 <span className={`font-mono font-bold flex items-center gap-1 text-sm ${isOverload ? 'text-red-500' : (isDarkMode ? 'text-white' : 'text-slate-800')}`}>
                   {totalPower.toLocaleString()} W
                 </span>
                 <ChevronDown size={14} className={`transition-transform ${isUpsPanelOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
            
            {isUpsPanelOpen && (
              <div className={`px-4 pb-4 pt-1 ${isDarkMode ? 'bg-transparent' : 'bg-transparent'}`}>
                <div className="grid grid-cols-2 gap-3 mb-3">
                   <div>
                      <label className={`block text-[10px] font-bold mb-1 ${textLabel}`}>UPS 定格出力 (W)</label>
                      <input type="number" value={upsWattLimit} onChange={e => setUpsWattLimit(Number(e.target.value))} placeholder="例: 900 (CyberPower等)" className={`w-full px-2 py-1.5 border rounded text-xs font-mono outline-none focus:ring-1 focus:ring-blue-500 ${inputBg}`} />
                   </div>
                   <div>
                      <label className={`block text-[10px] font-bold mb-1 ${textLabel}`}>バッテリー容量 (Wh)</label>
                      <input type="number" value={upsBatteryWh} onChange={e => setUpsBatteryWh(Number(e.target.value))} placeholder="例: 132" className={`w-full px-2 py-1.5 border rounded text-xs font-mono outline-none focus:ring-1 focus:ring-blue-500 ${inputBg}`} />
                   </div>
                </div>
                
                <div className="mb-1 flex justify-between items-end">
                   <span className={`text-[10px] font-bold ${textLabel}`}>負荷率 (Load)</span>
                   <span className={`text-xs font-mono font-bold ${isOverload ? 'text-red-500 animate-pulse' : (loadRatio > 80 ? 'text-yellow-500' : 'text-green-500')}`}>
                      {loadRatio.toFixed(1)}% {isOverload && '⚠️ 過負荷'}
                   </span>
                </div>
                <div className={`w-full h-1.5 rounded-full mb-3 overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                   <div className={`h-full rounded-full transition-all duration-500 ${isOverload ? 'bg-red-500' : (loadRatio > 80 ? 'bg-yellow-500' : 'bg-green-500')}`} style={{ width: `${Math.min(100, loadRatio)}%` }}></div>
                </div>
                
                <div className={`p-2 rounded border flex items-center justify-between ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
                   <div className="flex items-center gap-1.5">
                      <Clock size={12} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
                      <span className={`text-[10px] font-bold ${textLabel}`}>停電時の推定稼働時間</span>
                   </div>
                   <span className={`font-mono font-bold text-sm ${totalPower === 0 ? 'text-slate-500' : (isOverload ? 'text-red-500' : 'text-blue-500')}`}>
                      {totalPower === 0 ? '-' : (isOverload ? 'ダウン' : `約 ${estimatedRuntimeMin} 分`)}
                   </span>
                </div>
              </div>
            )}
          </div>

          {/* 🌟 修正: Terraform 出力ボタンを追加し、2x2のグリッドに調整 */}
          <div className="grid grid-cols-2 gap-2 mb-2">
             <button onClick={() => exportToTerraform(nodes, edges)} className="bg-orange-600 hover:bg-orange-500 transition-colors text-white text-[10px] py-2 rounded font-bold shadow flex justify-center items-center gap-1">
               <Code size={12}/> Terraform (.tf)
             </button>
             <button onClick={() => exportToKubernetesYAML(nodes, edges)} className="bg-indigo-600 hover:bg-indigo-500 transition-colors text-white text-[10px] py-2 rounded font-bold shadow flex justify-center items-center gap-1">
               ☸️ K8s出力
             </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
             <button onClick={() => exportToDockerCompose(nodes, edges)} className="bg-cyan-600 hover:bg-cyan-500 transition-colors text-white text-[10px] py-2 rounded font-bold shadow flex justify-center items-center gap-1">
               🐳 Compose
             </button>
             <button onClick={() => exportToYAML(nodes, edges)} className="bg-emerald-600 hover:bg-emerald-500 transition-colors text-white text-[10px] py-2 rounded font-bold shadow flex items-center justify-center gap-1">
               <FileText size={12}/>YAML
             </button>
             <button onClick={() => exportToMarkdown(nodes, edges)} className="bg-purple-600 hover:bg-purple-500 transition-colors text-white text-[10px] py-2 rounded font-bold shadow flex items-center justify-center gap-1">
               <Terminal size={12}/>MD仕様書
             </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-2">
             <button onClick={() => onExport('png')} className="bg-blue-600 hover:bg-blue-500 transition-colors text-white text-[10px] py-2.5 rounded font-bold shadow flex justify-center items-center">PNG画像として保存</button>
             <button onClick={() => exportToDrawio(nodes, edges)} className="bg-[#f08705] hover:bg-[#d07504] transition-colors text-white text-[10px] py-2.5 rounded font-bold shadow flex items-center justify-center gap-1">
               <FileDown size={12}/> Draw.io (.drawio)
             </button>
          </div>
        </div>
      </aside>

      <DictionaryModal isOpen={isDictOpen} onClose={() => setIsDictOpen(false)} isDarkMode={isDarkMode} />
    </>
  );
}