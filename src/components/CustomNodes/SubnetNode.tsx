import { memo } from 'react';
import { Handle, Position, useNodes, NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { calculateSubnet } from '../../utils/subnetCalc';

const SubnetNode = memo(({ id, data, selected }: NodeProps) => {
  const nodes = useNodes();
  const isDarkMode = !!data.isDarkMode;
  
  const connectedCount = nodes.filter(n => n.parentId === id && n.type === 'device').length;
  
  const cidr = (data.cidr as string) || '/24';
  const baseNetwork = '192.168.1';
  const sim = calculateSubnet(cidr, baseNetwork);
  
  const maxHosts = sim ? sim.maxHosts : 254;
  const usage = Math.round((connectedCount / maxHosts) * 100);
  const isOver = connectedCount > maxHosts;

  const children = nodes.filter(n => n.parentId === id);
  let minW = 300;
  let minH = 200;
  if (children.length > 0) {
    let maxRight = 0;
    let maxBottom = 0;
    children.forEach(c => {
       const cw = c.measured?.width ?? c.width ?? Number(c.style?.width) ?? (c.type === 'subnet' ? 450 : 100);
       const ch = c.measured?.height ?? c.height ?? Number(c.style?.height) ?? (c.type === 'subnet' ? 280 : 100);
       if (c.position.x + cw > maxRight) maxRight = c.position.x + cw;
       if (c.position.y + ch > maxBottom) maxBottom = c.position.y + ch;
    });
    if (maxRight + 20 > minW) minW = maxRight + 20;
    if (maxBottom + 20 > minH) minH = maxBottom + 20;
  }

  const currentNode = nodes.find(n => n.id === id);
  const parentNode = currentNode?.parentId ? nodes.find(n => n.id === currentNode.parentId) : null;
  
  let maxW = undefined;
  let maxH = undefined;
  if (parentNode && currentNode) {
     const pW = parentNode.measured?.width ?? parentNode.width ?? Number(parentNode.style?.width) ?? 500;
     const pH = parentNode.measured?.height ?? parentNode.height ?? Number(parentNode.style?.height) ?? 350;
     const posX = Math.max(0, currentNode.position.x);
     const posY = Math.max(0, currentNode.position.y);
     maxW = Math.max(minW, pW - posX - 10);
     maxH = Math.max(minH, pH - posY - 10);
  }

  const handleResizeEnd = (_: any, params: any) => {
    let warned = false;
    if (maxW && params.width >= maxW - 2) {
      setTimeout(() => alert('⚠️ エラー: 親サブネットの枠を越えて拡大することはできません！'), 50);
      warned = true;
    }
    if (!warned && maxH && params.height >= maxH - 2) {
      setTimeout(() => alert('⚠️ エラー: 親サブネットの枠を越えて拡大することはできません！'), 50);
      warned = true;
    }
    if (!warned && (params.width <= minW + 2 || params.height <= minH + 2) && children.length > 0) {
      setTimeout(() => alert('⚠️ エラー: 中にあるデバイスやサブネットを押し潰すサイズには縮小できません！'), 50);
    }
  };

  // ダークモード・ライトモードのスタイル分岐
  const containerClass = isDarkMode
    ? selected ? 'border-blue-500 bg-slate-900/40' : 'border-slate-600 bg-slate-900/20'
    : selected ? 'border-blue-500 bg-blue-50/10' : 'border-slate-300 bg-slate-50/30';

  const headerClass = isDarkMode
    ? 'bg-slate-800 border-b border-slate-700 text-slate-200'
    : 'bg-white border-b border-slate-200 text-slate-700';

  const badgeClass = isOver
    ? isDarkMode ? 'bg-red-900/40 text-red-400' : 'bg-red-100 text-red-700'
    : isDarkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-800';

  return (
    <>
      <NodeResizer 
        color="#3b82f6" 
        isVisible={selected} 
        minWidth={minW} 
        minHeight={minH} 
        maxWidth={maxW} 
        maxHeight={maxH} 
        onResizeEnd={handleResizeEnd} 
        handleStyle={{ 
          width: 12, height: 12, borderRadius: 4, 
          backgroundColor: isDarkMode ? '#1e293b' : '#fff', 
          border: '2px solid #3b82f6' 
        }}
        lineStyle={{ borderWidth: 2 }}
      />
      
      {/* フレックスボックス構造にして中身のレイアウトを安定させます */}
      <div className={`w-full h-full rounded-lg border-2 border-dashed transition-all flex flex-col ${containerClass}`}>
        
        <Handle type="target" position={Position.Top} className="w-6 h-6 bg-blue-500 opacity-0 hover:opacity-100 transition-opacity -top-3 cursor-crosshair border-2 border-white shadow-sm" />
        
        <div className={`z-10 flex items-center justify-between px-3 py-2 rounded-t-md m-[1px] ${headerClass}`}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <div className="text-xs font-bold">
              {data.label as string}
            </div>
          </div>
          
          <div className={`text-[10px] font-bold px-2 py-1 rounded ${badgeClass}`}>
            接続中: {connectedCount}台 / 最大{maxHosts}台 (使用率 {usage}%)
          </div>
        </div>
        
        {/* コンテンツの余白を埋めるためのスペーサー */}
        <div className="flex-1" />
        
        <Handle type="source" position={Position.Bottom} className="w-6 h-6 bg-blue-500 opacity-0 hover:opacity-100 transition-opacity -bottom-3 cursor-crosshair border-2 border-white shadow-sm" />
      </div>
    </>
  );
});

export default SubnetNode;