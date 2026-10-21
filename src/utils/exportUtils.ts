import { toPng } from 'html-to-image';
import type { Node, Edge } from '@xyflow/react';

// 🎯 追加: 保存ダイアログを表示してファイルを保存する共通関数
async function saveFile(content: string | Blob, defaultName: string, mimeType: string, extension: string, description: string) {
  try {
    // 1. File System Access API を使用 (保存場所の指定ダイアログを表示)
    if ('showSaveFilePicker' in window) {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description, accept: { [mimeType]: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }
  } catch (error: any) {
    if (error.name === 'AbortError') return; // ユーザーがキャンセルした場合は何もしない
    console.warn('showSaveFilePicker failed, falling back to <a> tag', error);
  }

  // 2. Web API非対応時のフォールバック (従来のダウンロード方式)
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Fallback download failed', error);
    alert('保存に失敗しました。');
  }
}

export const exportToPNG = async (element: HTMLElement) => {
  try {
    const dataUrl = await toPng(element, { backgroundColor: '#ffffff' });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await saveFile(blob, 'network-diagram.png', 'image/png', '.png', 'PNG Image');
  } catch (err) {
    console.error('PNG export failed', err);
    alert('PNGのエクスポートに失敗しました。');
  }
};

export const exportToPDF = (_element: HTMLElement) => {
  alert("PDF出力機能は現在準備中です。");
};

export const exportToYAML = async (nodes: Node[], edges: Edge[]) => {
  let yamlContent = "network_configuration:\n";
  yamlContent += "  devices:\n";
  const devices = nodes.filter(n => n.type === 'device');
  devices.forEach(dev => {
    yamlContent += `    - id: ${dev.id}\n`;
    yamlContent += `      name: ${dev.data.label}\n`;
    yamlContent += `      type: ${dev.data.deviceType}\n`;
    if (dev.data.ip) yamlContent += `      ip: ${dev.data.ip}\n`;
    if (dev.data.vlan) yamlContent += `      vlan: ${dev.data.vlan}\n`;
    if (dev.data.power) yamlContent += `      power_w: ${dev.data.power}\n`;
    
    const routingTable = dev.data.routingTable as any[];
    if (routingTable && routingTable.length > 0) {
      yamlContent += `      routes:\n`;
      routingTable.forEach(route => {
        yamlContent += `        - destination: ${route.dest}\n`;
        yamlContent += `          next_hop: ${route.nextHop}\n`;
      });
    }
  });

  yamlContent += "  connections:\n";
  edges.forEach(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    const sourceName = sourceNode?.data.label || edge.source;
    const targetName = targetNode?.data.label || edge.target;
    yamlContent += `    - source: ${sourceName}\n`;
    yamlContent += `      target: ${targetName}\n`;
  });

  await saveFile(yamlContent, 'network-config.yaml', 'text/yaml', '.yaml', 'YAML Document');
};

const escapeXml = (unsafe: string) => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;';
      case '\'': return '&apos;'; case '"': return '&quot;'; default: return c;
    }
  });
};

export const exportToDrawio = async (nodes: Node[], edges: Edge[]) => {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<mxfile version="21.6.8" type="device">\n  <diagram id="netpalette-export" name="Network Diagram">\n    <mxGraphModel dx="1000" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" background="#ffffff" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n';

  nodes.forEach(node => {
    const isSubnet = node.type === 'subnet';
    const parentId = node.parentId || "1";
    const w = node.measured?.width ?? node.width ?? Number(node.style?.width) ?? (isSubnet ? 450 : 100);
    const h = node.measured?.height ?? node.height ?? Number(node.style?.height) ?? (isSubnet ? 280 : 100);
    const label = escapeXml(String(node.data.label || ''));
    const ip = escapeXml(String(node.data.ip || ''));
    const devType = escapeXml(String(node.data.deviceType || ''));
    
    let style = ""; let displayLabel = "";
    if (isSubnet) {
      style = "rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=none;strokeColor=#3b82f6;align=left;verticalAlign=top;spacingLeft=10;spacingTop=10;fontStyle=1;strokeWidth=2;";
      displayLabel = `<b>${label}</b>`;
    } else {
      style = "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#94a3b8;shadow=0;fontColor=#333333;";
      displayLabel = `<b>${devType}</b><br/><br/>${label}<br/><font color="#64748b" size="1">IP: ${ip}</font>`;
    }
    xml += `        <mxCell id="${node.id}" value="${displayLabel}" style="${style}" vertex="1" parent="${parentId}">\n          <mxGeometry x="${node.position.x}" y="${node.position.y}" width="${w}" height="${h}" as="geometry" />\n        </mxCell>\n`;
  });

  edges.forEach(edge => {
    const style = "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#3b82f6;dashed=1;";
    xml += `        <mxCell id="${edge.id}" style="${style}" edge="1" parent="1" source="${edge.source}" target="${edge.target}">\n          <mxGeometry relative="1" as="geometry" />\n        </mxCell>\n`;
  });

  xml += '      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>';
  
  await saveFile(xml, 'network-diagram.drawio', 'application/xml', '.drawio', 'Draw.io Diagram');
};

export const exportToMarkdown = async (nodes: Node[], edges: Edge[]) => {
  void edges;
  let md = "# ネットワーク仕様書\n\n";
  
  md += "## 1. デバイス一覧\n\n";
  md += "| ホスト名 | 機器タイプ | IPアドレス | VLAN | 消費電力(W) |\n|---|---|---|---|---|\n";
  const devices = nodes.filter(n => n.type === 'device');
  devices.forEach(dev => {
    md += `| ${dev.data.label || '-'} | ${dev.data.deviceType || '-'} | ${dev.data.ip || '-'} | ${dev.data.vlan || '-'} | ${dev.data.power || 0} |\n`;
  });
  
  md += "\n## 2. ルーティングテーブル\n\n";
  const routers = devices.filter(n => (n.data.routingTable as any[])?.length > 0);
  if (routers.length > 0) {
    routers.forEach(r => {
      md += `### ${r.data.label}\n| 宛先ネットワーク | ネクストホップ |\n|---|---|\n`;
      (r.data.routingTable as any[]).forEach(route => { md += `| ${route.dest} | ${route.nextHop} |\n`; });
      md += "\n";
    });
  } else { md += "設定なし\n\n"; }

  md += "## 3. FW / ACL 設定\n\n";
  const fws = devices.filter(n => (n.data.acl as any[])?.length > 0);
  if (fws.length > 0) {
    fws.forEach(fw => {
      md += `### ${fw.data.label}\n| ターゲットIP/NW | アクション |\n|---|---|\n`;
      (fw.data.acl as any[]).forEach(rule => { md += `| ${rule.ip} | ${rule.action === 'deny' ? '拒否 (Deny)' : '許可 (Allow)'} |\n`; });
      md += "\n";
    });
  } else { md += "設定なし\n\n"; }

  await saveFile(md, 'network-spec.md', 'text/markdown', '.md', 'Markdown Document');
};