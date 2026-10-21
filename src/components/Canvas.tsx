import { useState, useRef, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { ReactFlow, Controls, Background, useReactFlow, MiniMap } from '@xyflow/react'; 
import type { Node, Edge, Connection, OnNodesChange, OnEdgesChange } from '@xyflow/react';

import DeviceNode from './CustomNodes/DeviceNode';
import SubnetNode from './CustomNodes/SubnetNode';
import TextNode from './CustomNodes/TextNode'; 
import AreaNode from './CustomNodes/AreaNode'; 
import CustomEdge from './edges/CustomEdge'; 

import { calculateSubnet } from '../utils/subnetCalc';

const nodeTypes = { device: DeviceNode, subnet: SubnetNode, text: TextNode, area: AreaNode };
const edgeTypes = { custom: CustomEdge };
const defaultEdgeOptions = { type: 'custom', zIndex: -2 };

// 🌟 修正: onNodeDoubleClick を Props に追加
type CanvasProps = {
  nodes: Node[]; edges: Edge[];
  onNodesChange: OnNodesChange; onEdgesChange: OnEdgesChange;
  onConnect: (params: Connection | Edge) => void;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  deleteNode: (id: string | string[]) => void;
  isLocked: boolean; searchQuery: string; isDarkMode: boolean; 
  onNodeClick?: (event: React.MouseEvent, node: Node) => void; 
  onNodeDoubleClick?: (event: React.MouseEvent, node: Node) => void; 
};

export default function Canvas({ 
  nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, deleteNode, 
  isLocked, searchQuery, isDarkMode, onNodeClick, onNodeDoubleClick // 🌟 修正: Propsから受け取る
}: CanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [isHoveringTrash, setIsHoveringTrash] = useState(false);
  
  const [ripples, setRipples] = useState<{id: number, x: number, y: number}[]>([]);
  const trashRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);

  const processedNodes = useMemo(() => {
    if (!searchQuery) return nodes;
    const lowerQuery = searchQuery.toLowerCase();
    return nodes.map(node => {
      const isMatch = String(node.data.label || '').toLowerCase().includes(lowerQuery) || String(node.data.ip || '').toLowerCase().includes(lowerQuery);
      return { ...node, style: { ...node.style, opacity: isMatch ? 1 : 0.15, transition: 'opacity 0.3s ease' } };
    });
  }, [nodes, searchQuery]);

  const getAbsolutePosition = useCallback((node: Node, allNodes: Node[]): { x: number, y: number } => {
    let x = node.position.x; let y = node.position.y; let curr = node;
    while (curr.parentId) { const parent = allNodes.find(n => n.id === curr.parentId); if (!parent) break; x += parent.position.x; y += parent.position.y; curr = parent; } return { x, y };
  }, []);

  const getNodeSize = useCallback((n: Node) => ({ w: n.measured?.width ?? n.width ?? Number(n.style?.width) ?? (n.type === 'subnet' ? 450 : n.type === 'area' ? 300 : 100), h: n.measured?.height ?? n.height ?? Number(n.style?.height) ?? (n.type === 'subnet' ? 280 : n.type === 'area' ? 200 : 100) }), []);
  const getMaxHosts = useCallback((cidrString: string | undefined) => { const sim = calculateSubnet(cidrString || '/24', '192.168.1'); return sim ? sim.maxHosts : 254; }, []);

  const onNodeDragStart = useCallback(() => setIsDraggingNode(true), []);
  
  const onNodeDrag = useCallback((event: any) => {
    if (!trashRef.current || isLocked) return;
    const nativeEvent = event.nativeEvent || event; const clientX = nativeEvent.touches ? nativeEvent.touches[0].clientX : event.clientX; const clientY = nativeEvent.touches ? nativeEvent.touches[0].clientY : event.clientY;
    const rect = trashRef.current.getBoundingClientRect(); const isHover = clientX >= rect.left - 30 && clientX <= rect.right + 30 && clientY >= rect.top - 30 && clientY <= rect.bottom + 30;
    if (isHover !== isHoveringRef.current) { isHoveringRef.current = isHover; setIsHoveringTrash(isHover); }
  }, [isLocked]);

  const onNodeDragStop = useCallback((_event: any, node: Node) => {
    setIsDraggingNode(false);
    if (isLocked) return;
    
    const wasHovering = isHoveringRef.current; isHoveringRef.current = false; setIsHoveringTrash(false);
    if (wasHovering) { deleteNode(node.id); return; }

    const subnets = nodes.filter(n => n.type === 'subnet' && n.id !== node.id).sort((a, b) => (getNodeSize(a).w * getNodeSize(a).h) - (getNodeSize(b).w * getNodeSize(b).h));
    let foundParent: Node | null = null; let isLogicalSizeError = false; let errorParent: Node | null = null; 
    const absPos = getAbsolutePosition(node, nodes); const cSize = getNodeSize(node); const centerX = absPos.x + (cSize.w / 2); const centerY = absPos.y + (cSize.h / 2); const childMaxHosts = node.type === 'subnet' ? getMaxHosts(node.data?.cidr as string) : 0;

    for (const subnet of subnets) {
      const sSize = getNodeSize(subnet); const sAbs = getAbsolutePosition(subnet, nodes);
      if (centerX >= sAbs.x && centerX <= sAbs.x + sSize.w && centerY >= sAbs.y && centerY <= sAbs.y + sSize.h) {
        if (node.type === 'subnet' && childMaxHosts >= getMaxHosts(subnet.data?.cidr as string)) { isLogicalSizeError = true; errorParent = subnet; continue; }
        let isLoop = false; let curr = subnet;
        while(curr.parentId) { if (curr.parentId === node.id) { isLoop = true; break; } curr = nodes.find(n => n.id === curr.parentId) || curr; if (!curr.parentId) break; }
        if (!isLoop) { foundParent = subnet; break; }
      }
    }

    if (isLogicalSizeError && !foundParent) {
      setTimeout(() => alert('⚠️ エラー: 親サブネットより大きなIP数のサブネットは配置できません。'), 50);
      let safeX = absPos.x; let safeY = absPos.y;
      if (errorParent) {
        const epSize = getNodeSize(errorParent); const epAbs = getAbsolutePosition(errorParent, nodes);
        safeX = epAbs.x + epSize.w + 50; safeY = epAbs.y; 
      }
      setNodes((nds) => nds.map((n) => n.id === node.id ? { ...n, parentId: undefined, position: { x: safeX, y: safeY } } : n));
      return; 
    }

    if (foundParent && node.parentId !== foundParent.id) {
      const parentAbs = getAbsolutePosition(foundParent, nodes);
      setNodes((nds) => nds.map((n) => {
        if (n.id === node.id) {
          const updatedNode = { ...n, parentId: foundParent!.id, position: { x: absPos.x - parentAbs.x, y: absPos.y - parentAbs.y } };
          if (n.type === 'device') {
            let baseIp = '192.168.1'; const cidrStr = foundParent!.data.cidr as string || '/24'; if (cidrStr.includes('.')) baseIp = cidrStr.split('/')[0].split('.').slice(0, 3).join('.');
            const siblingsCount = nds.filter(sibling => sibling.parentId === foundParent!.id && sibling.type === 'device' && sibling.id !== n.id).length;
            updatedNode.data = { ...updatedNode.data, ip: `${baseIp}.${siblingsCount + 2}` };
          }
          return updatedNode;
        }
        return n;
      }));
    } else if (!foundParent) {
      setNodes((nds) => nds.map((n) => n.id === node.id ? { ...n, parentId: undefined, position: absPos } : n));
    }
  }, [nodes, setNodes, deleteNode, getAbsolutePosition, getNodeSize, getMaxHosts, isLocked]);

  const onDragOver = useCallback((event: React.DragEvent) => { 
    event.preventDefault(); 
    event.dataTransfer.dropEffect = 'move'; 
  }, []);
  
  const onDrop = useCallback((event: React.DragEvent) => {
      event.preventDefault(); 
      const dataTransferType = event.dataTransfer.getData('application/reactflow');
      const dataTransferDeviceType = event.dataTransfer.getData('application/devicetype');
      
      const draggedItem = (window as any).draggedItem; 
      const finalType = dataTransferType || draggedItem?.type;
      const deviceType = dataTransferDeviceType || draggedItem?.deviceType;
      
      if (!finalType) return;
      if (draggedItem) (window as any).draggedItem = null;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const flowPos = { x: event.clientX, y: event.clientY };
      setRipples(prev => [...prev, { id: Date.now(), x: flowPos.x, y: flowPos.y }]); setTimeout(() => setRipples(prev => prev.slice(1)), 800);

      const newId = `node_v_${Date.now()}`; 
      let cWidth = 100; let cHeight = 100;
      
      const newNode: Node = { 
        id: newId, type: finalType, position, 
        data: { isDarkMode } 
      };

      if (finalType === 'subnet') {
        cWidth = 450; cHeight = 280;
        newNode.data = { ...newNode.data, label: '新規サブネット', cidr: '/24' };
        newNode.style = { width: cWidth, height: cHeight };
        newNode.zIndex = -1;
      } else if (finalType === 'area') {
        cWidth = 300; cHeight = 200;
        newNode.data = { ...newNode.data, label: '新規エリア', color: '#3b82f6' };
        newNode.style = { width: cWidth, height: cHeight };
        newNode.zIndex = -2;
      } else if (finalType === 'text') {
        newNode.data = { ...newNode.data, label: 'テキスト', fontSize: 14, color: isDarkMode ? '#e2e8f0' : '#1e293b' };
        newNode.zIndex = 10;
      } else {
        newNode.type = 'device';
        newNode.data = { ...newNode.data, deviceType: deviceType || 'PC', label: `新規${deviceType || 'PC'}`, ip: '192.168.1.xxx', mac: '00:00:00:00:00:00', status: 'up' };
      }

      const subnets = nodes.filter(n => n.type === 'subnet').sort((a, b) => (getNodeSize(a).w * getNodeSize(a).h) - (getNodeSize(b).w * getNodeSize(b).h));
      let foundParent: Node | null = null; let isLogicalSizeError = false; let errorParent: Node | null = null;
      const centerX = position.x + (cWidth / 2); const centerY = position.y + (cHeight / 2);

      for (const subnet of subnets) {
        const sSize = getNodeSize(subnet); const sAbs = getAbsolutePosition(subnet, nodes);
        if (centerX >= sAbs.x && centerX <= sAbs.x + sSize.w && centerY >= sAbs.y && centerY <= sAbs.y + sSize.h) {
          if (finalType === 'subnet' && getMaxHosts('/24') >= getMaxHosts(subnet.data?.cidr as string)) { isLogicalSizeError = true; errorParent = subnet; continue; }
          foundParent = subnet; break;
        }
      }

      if (isLogicalSizeError && !foundParent) {
         setTimeout(() => alert('⚠️ エラー: 親サブネットより大きなIP数は配置できません。外側に移動しました。'), 50);
         if (errorParent) { const epSize = getNodeSize(errorParent); const epAbs = getAbsolutePosition(errorParent, nodes); newNode.position = { x: epAbs.x + epSize.w + 50, y: epAbs.y }; }
      } else if (foundParent) {
        newNode.parentId = foundParent.id; 
        const parentAbs = getAbsolutePosition(foundParent, nodes); 
        newNode.position = { x: position.x - parentAbs.x, y: position.y - parentAbs.y };
        
        if (newNode.type === 'device') {
          let baseIp = '192.168.1'; const cidrStr = foundParent.data.cidr as string || '/24'; if (cidrStr.includes('.')) baseIp = cidrStr.split('/')[0].split('.').slice(0, 3).join('.');
          const siblingsCount = nodes.filter(n => n.parentId === foundParent!.id && n.type === 'device').length; newNode.data.ip = `${baseIp}.${siblingsCount + 2}`;
        }
      }
      setNodes((nds) => nds.concat(newNode));
  }, [screenToFlowPosition, nodes, setNodes, getAbsolutePosition, getNodeSize, getMaxHosts, isDarkMode]);

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ minHeight: '100%' }}>
      {ripples.map(ripple => (<div key={ripple.id} className="absolute pointer-events-none z-50 border-4 border-blue-500 rounded-full animate-ping" style={{ left: ripple.x - 20, top: ripple.y - 20, width: 40, height: 40, opacity: 0.5 }} />))}
      
      {!isLocked && (
        <div ref={trashRef} className={`absolute top-6 left-6 z-50 p-2 transition-all duration-300 ease-out flex items-center justify-center ${isHoveringTrash ? 'scale-125 drop-shadow-[0_0_15px_rgba(239,68,68,0.7)]' : isDraggingNode ? 'scale-110 opacity-100 drop-shadow-md animate-bounce' : 'opacity-0 pointer-events-none'}`}>
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="overflow-visible">
            <g className={`transition-transform duration-300 ${isHoveringTrash ? '-translate-y-1.5 rotate-[12deg]' : ''}`} style={{ transformOrigin: '20px 4px' }}>
              <path d="M4 7H20M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7" stroke={isHoveringTrash ? '#ef4444' : '#94a3b8'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            <path d="M5 7L6 19C6 20.1046 6.89543 21 8 21H16C17.1046 21 18 20.1046 18 19L19 7" stroke={isHoveringTrash ? '#ef4444' : '#94a3b8'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 11V17M14 11V17" stroke={isHoveringTrash ? '#ef4444' : '#94a3b8'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      <ReactFlow 
        nodes={processedNodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} 
        onConnect={onConnect} 
        onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop} 
        onNodeClick={onNodeClick} 
        onNodeDoubleClick={onNodeDoubleClick} // 🌟 修正: ReactFlow に onNodeDoubleClick を渡す
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={defaultEdgeOptions} fitView 
        snapToGrid={true} snapGrid={[20, 20]} 
        className={isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}
        nodesDraggable={!isLocked} nodesConnectable={!isLocked} elementsSelectable={!isLocked} 
      >
        <Background color={isDarkMode ? '#334155' : '#ccc'} gap={20} />
        
        <MiniMap 
          nodeColor={(node) => {
            if (node.type === 'subnet') return isDarkMode ? '#1e293b' : '#eff6ff';
            if (node.type === 'area') return (node.data.color as string) || '#3b82f6';
            if (node.type === 'text') return 'transparent';
            return isDarkMode ? '#60a5fa' : '#94a3b8';
          }}
          nodeStrokeColor={() => isDarkMode ? '#0f172a' : '#ffffff'}
          nodeStrokeWidth={2}
          maskColor={isDarkMode ? 'rgba(0, 0, 0, 0.65)' : 'rgba(248, 250, 252, 0.7)'} 
          style={{ backgroundColor: isDarkMode ? '#020617' : '#ffffff' }}
          className={`border rounded-lg shadow-sm ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`} 
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}