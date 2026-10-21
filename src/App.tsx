import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { ReactFlowProvider, addEdge, useNodesState, useEdgesState } from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react'; 
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';

import Canvas from './components/Canvas';
import Sidebar from './components/Sidebar';
import { exportToPNG, exportToPDF } from './utils/exportUtils';
import { Command, Save, RotateCcw, X, Trash2, Zap, Upload, Download, TerminalSquare, Users, Wifi, Settings, Moon, MonitorDot } from 'lucide-react';

import { AppNode, AppEdge, SimProtocol } from './types';
import { getRandomRta, RtaScenario } from './utils/rtaGenerator';
import { Trophy, PlayCircle } from 'lucide-react'; 
import { useLiveMonitoring } from './hooks/useLiveMonitoring';

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ydoc = new Y.Doc();
const ynodes = ydoc.getMap<AppNode>('nodes');
const yedges = ydoc.getMap<AppEdge>('edges');
let wsProvider: WebsocketProvider | null = null;

type Snapshot = { id: string; name: string; date: string; nodes: AppNode[]; edges: AppEdge[]; };

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const searchParams = new URLSearchParams(window.location.search);
  const urlRoomId = searchParams.get('room');
  const roomId = useMemo(() => urlRoomId || `room-${Math.random().toString(36).substring(2, 9)}`, [urlRoomId]);
  const [roomUrl, setRoomUrl] = useState('');

  const [cursors, setCursors] = useState<Map<number, any>>(new Map());
  const [myClientId, setMyClientId] = useState<number>(0);
  const [showWifiHeatmap, setShowWifiHeatmap] = useState(false);

  // 🌟 追加: アプリケーション設定用のState
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'zabbix'>('general');
  const [zabbixUrl, setZabbixUrl] = useState(() => localStorage.getItem('np_zabbix_url') || '');
  const [zabbixToken, setZabbixToken] = useState(() => localStorage.getItem('np_zabbix_token') || '');

  // 設定を自動保存
  useEffect(() => {
    localStorage.setItem('np_zabbix_url', zabbixUrl);
    localStorage.setItem('np_zabbix_token', zabbixToken);
  }, [zabbixUrl, zabbixToken]);

  const [terminal, setTerminal] = useState<{ isOpen: boolean; nodeId: string | null; logs: string[]; input: string }>({
    isOpen: false, nodeId: null, logs: [], input: ''
  });

  const [rtaMode, setRtaMode] = useState<{ active: boolean; startTime: number; elapsedTime: number; completed: boolean }>({
    active: false, startTime: 0, elapsedTime: 0, completed: false
  });

  const rtaModeRef = useRef(rtaMode);
  useEffect(() => { rtaModeRef.current = rtaMode; }, [rtaMode]);

  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  const [pingState, setPingState] = useState<{ active: boolean; sourceId: string | null; targetId: string | null; protocol: SimProtocol; port: string; status: 'idle' | 'success' | 'fail' }>({ active: false, sourceId: null, targetId: null, protocol: 'ICMP', port: '', status: 'idle' });

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges); 

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // 🌟 修正: Zabbix設定を渡す
  useLiveMonitoring(isLiveMode, nodes, setNodes, zabbixUrl, zabbixToken);

  useEffect(() => {
    if (isMultiplayer) {
      if (!wsProvider) {
        setWsStatus('connecting');
        wsProvider = new WebsocketProvider('wss://demos.yjs.dev/ws', `netpalette-${roomId}`, ydoc);
        
        wsProvider.on('status', (event: { status: 'disconnected' | 'connecting' | 'connected' }) => {
          setWsStatus(event.status);
          if (event.status === 'connected') {
            setRoomUrl(`${window.location.origin}${window.location.pathname}?room=${roomId}`);
          }
        });

        setMyClientId(wsProvider.awareness.clientID);
        wsProvider.awareness.setLocalStateField('user', { name: `User-${Math.floor(Math.random() * 1000)}` });
        wsProvider.awareness.on('change', () => {
          setCursors(new Map(wsProvider!.awareness.getStates()));
        });
      }

      const nodeObserver = (_event: Y.YMapEvent<AppNode>, transaction: Y.Transaction) => {
        if (transaction.origin === 'local') return;
        setNodes(Array.from(ynodes.values()));
      };
      const edgeObserver = (_event: Y.YMapEvent<AppEdge>, transaction: Y.Transaction) => {
        if (transaction.origin === 'local') return;
        setEdges(Array.from(yedges.values()));
      };
      ynodes.observe(nodeObserver);
      yedges.observe(edgeObserver);

      if (ynodes.size > 0) setNodes(Array.from(ynodes.values()));
      if (yedges.size > 0) setEdges(Array.from(yedges.values()));

      return () => {
        ynodes.unobserve(nodeObserver);
        yedges.unobserve(edgeObserver);
      };
    } else {
      if (wsProvider) {
        wsProvider.destroy();
        wsProvider = null;
        setWsStatus('disconnected');
        setCursors(new Map());
      }
    }
  }, [isMultiplayer, roomId, setNodes, setEdges]);

  useEffect(() => {
    if (!isMultiplayer) return;
    ydoc.transact(() => {
      const currentIds = new Set(nodes.map(n => n.id));
      for (const id of ynodes.keys()) {
        if (!currentIds.has(id)) ynodes.delete(id);
      }
      nodes.forEach(n => ynodes.set(n.id, n));
    }, 'local');
  }, [nodes, isMultiplayer]);

  useEffect(() => {
    if (!isMultiplayer) return;
    ydoc.transact(() => {
      const currentIds = new Set(edges.map(e => e.id));
      for (const id of yedges.keys()) {
        if (!currentIds.has(id)) yedges.delete(id);
      }
      edges.forEach(e => yedges.set(e.id, e));
    }, 'local');
  }, [edges, isMultiplayer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isMultiplayer || !wsProvider) return;
    wsProvider.awareness.setLocalStateField('cursor', { x: e.clientX, y: e.clientY });
  }, [isMultiplayer]);

  const nodesWithHeatmap = useMemo(() => {
    let result = [...nodes];
    if (showWifiHeatmap) {
      const wifiDevices = nodes.filter(n => n.type === 'device' && (
        String(n.data.deviceType).includes('Wi-Fi') || 
        String(n.data.deviceType).includes('ルーター') ||
        String(n.data.label).includes('Wi-Fi') ||
        String(n.data.label).includes('AP') ||
        String(n.data.label).includes('アクセス')
      ));
      
      wifiDevices.forEach(dev => {
        const radius = 350;
        const diameter = radius * 2;
        const offsetX = (100 - diameter) / 2;
        const offsetY = (100 - diameter) / 2;
        
        result.push({
          id: `wifi-heatmap-${dev.id}`,
          type: 'default',
          position: { x: dev.position.x + offsetX, y: dev.position.y + offsetY },
          data: { label: '' },
          parentId: dev.parentId,
          style: {
            width: diameter,
            height: diameter,
            borderRadius: '50%',
            background: isDarkMode 
              ? 'radial-gradient(circle, rgba(96,165,250,0.15) 0%, rgba(96,165,250,0.02) 60%, rgba(0,0,0,0) 100%)'
              : 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.02) 60%, rgba(255,255,255,0) 100%)',
            border: `1px dashed ${isDarkMode ? 'rgba(96,165,250,0.3)' : 'rgba(59,130,246,0.4)'}`,
            pointerEvents: 'none',
            zIndex: -1,
            mixBlendMode: isDarkMode ? 'screen' : 'multiply'
          },
          draggable: false,
          selectable: false,
        } as AppNode);
      });
    }
    return result;
  }, [nodes, showWifiHeatmap, isDarkMode]);

  useEffect(() => {
    let timer: number;
    if (rtaMode.active && !rtaMode.completed) {
      timer = window.setInterval(() => {
        setRtaMode(prev => ({ ...prev, elapsedTime: Math.floor((Date.now() - prev.startTime) / 1000) }));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [rtaMode.active, rtaMode.completed]);

  const startRtaMode = () => {
    const diffInput = prompt('難易度を 1(初級), 2(中級), 3(上級) から入力してください。\n(未入力で完全ランダム)');
    let diff: 1 | 2 | 3 | undefined = undefined;
    if (diffInput === '1') diff = 1;
    if (diffInput === '2') diff = 2;
    if (diffInput === '3') diff = 3;

    const scenario: RtaScenario = getRandomRta(diff);

    setNodes(scenario.nodes as AppNode[]);
    setEdges(scenario.edges as AppEdge[]);
    setRtaMode({ active: true, startTime: Date.now(), elapsedTime: 0, completed: false });
    setShowCmdPalette(false);

    alert(`🎮 障害復旧RTAモード [${scenario.title}]\n\n【ミッション】\n${scenario.description}\n\nトラブルを特定して設定を修正し、通信テストを成功させてください！`);
  };

  useEffect(() => {
    setNodes((nds) => nds.map(n => ({ ...n, data: { ...n.data, isDarkMode } })));
    setEdges((eds) => eds.map(edge => {
      const sourceNode = nodesRef.current.find(n => n.id === edge.source);
      const targetNode = nodesRef.current.find(n => n.id === edge.target);
      const isDown = sourceNode?.data?.status === 'down' || targetNode?.data?.status === 'down' || edge.data?.status === 'down';
      const isInternet = sourceNode?.data?.deviceType === 'クラウド' || targetNode?.data?.deviceType === 'クラウド' || String(sourceNode?.data?.deviceType).includes('AWS') || String(targetNode?.data?.deviceType).includes('AWS');
      return {
        ...edge, 
        style: {
          ...edge.style, 
          stroke: isDown ? '#94a3b8' : (isInternet ? '#ef4444' : (isDarkMode ? '#60a5fa' : '#3b82f6')),
          strokeDasharray: '5 5', 
        }
      };
    }));
  }, [isDarkMode, setNodes, setEdges]); 

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { 
        e.preventDefault(); 
        setShowCmdPalette(true); 
      }
      if (e.key === 'Escape') { 
        setShowCmdPalette(false); 
        setShowSaveModal(false); 
        setShowRestoreModal(false);
        setShowSettingsModal(false); // 設定モーダルも閉じる
        setPingState({ active: false, sourceId: null, targetId: null, protocol: 'ICMP', port: '', status: 'idle' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleStartPing = (e: Event) => { 
      const customEvent = e as CustomEvent<{ sourceId: string }>;
      setPingState({ active: true, sourceId: customEvent.detail.sourceId, targetId: null, protocol: 'ICMP', port: '', status: 'idle' }); 
    };
    window.addEventListener('start-ping', handleStartPing);
    return () => window.removeEventListener('start-ping', handleStartPing);
  }, []);

  const updateEdgeData = useCallback((id: string, newData: Record<string, unknown>) => {
    setEdges(eds => eds.map(e => e.id === id ? { ...e, data: { ...e.data, ...newData } } : e));
  }, [setEdges]);

  const deleteEdge = useCallback((id: string) => {
    setEdges(eds => eds.filter(e => e.id !== id));
  }, [setEdges]);

  const executePing = useCallback((sourceId: string, targetId: string) => {
    const sourceNode = nodesRef.current.find(n => n.id === sourceId);
    const targetNode = nodesRef.current.find(n => n.id === targetId);
    if (!sourceNode || !targetNode) return;

    let success = false; 
    let reason = '';
    const { protocol, port } = pingState;
    
    const targetAcl = (targetNode.data.acl as any[]) || [];
    const sourceIp = sourceNode.data.ip as string;
    const isBlocked = targetAcl.some(rule => {
      if (rule.action === 'deny' && rule.ip) {
        const ipMatch = rule.ip === sourceIp || (rule.ip.includes('/') && rule.ip.split('/')[0].split('.').slice(0, 3).join('.') === sourceIp.split('.').slice(0, 3).join('.'));
        const protoMatch = rule.protocol === 'ANY' || rule.protocol === protocol;
        const portMatch = !rule.port || rule.port === port;
        if (ipMatch && protoMatch && portMatch) return true;
      }
      return false;
    });

    const adj = new Map<string, { to: string, edgeId: string }[]>();
    edgesRef.current.forEach(e => {
      if (e.data?.status === 'down') return;
      const sNode = nodesRef.current.find(n => n.id === e.source);
      const tNode = nodesRef.current.find(n => n.id === e.target);
      if (sNode?.data.status === 'down' || tNode?.data.status === 'down') return;

      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      adj.get(e.source)!.push({ to: e.target, edgeId: e.id });
      adj.get(e.target)!.push({ to: e.source, edgeId: e.id });
    });

    const queue = [{ node: sourceId, path: [] as string[] }];
    const visited = new Set<string>([sourceId]);
    let successPathEdges: string[] = [];

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      if (node === targetId) { successPathEdges = path; break; }
      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.to)) {
          visited.add(neighbor.to);
          queue.push({ node: neighbor.to, path: [...path, neighbor.edgeId] });
        }
      }
    }

    if (successPathEdges.length === 0) {
      success = false;
      reason = '【物理リンク障害】宛先までの有効な物理経路(ケーブル)が存在しないか、断線しています。';
    } else if (isBlocked) {
      success = false;
      reason = `【🛡️ ACL遮断】宛先のFWにより ${protocol}${port ? ':'+port : ''} の通信が遮断されました。`;
    } else {
      const sourceVlan = sourceNode.data.vlan || '1'; 
      const targetVlan = targetNode.data.vlan || '1';
      const sourceSubnet = nodesRef.current.find(n => n.id === sourceNode.parentId); 
      const targetSubnet = nodesRef.current.find(n => n.id === targetNode.parentId);
      
      const isSameSubnet = sourceSubnet && targetSubnet && sourceSubnet.id === targetSubnet.id; 
      const isSameVlan = sourceVlan === targetVlan;

      if (isSameSubnet && isSameVlan) { 
        success = true; reason = `【L2通信】同一サブネット・VLAN内のため、${protocol} 通信に成功しました。`; 
      } else if (isSameSubnet && !isSameVlan) { 
        success = false; reason = '【VLAN遮断】同一サブネットですが、VLAN IDが異なるため遮断されました。'; 
      } else {
        const routers = nodesRef.current.filter(n => (n.data.deviceType === 'ルーター' || n.data.deviceType === 'L3SW' || n.data.deviceType === 'FW') && n.data.status !== 'down');
        if (routers.length === 0) { 
          success = false; reason = '【到達不能】稼働中のルーターやL3スイッチが存在しません。'; 
        } else {
          const targetIp = (targetNode.data.ip as string) || '';
          const targetNetwork = targetIp.split('.').slice(0,3).join('.') + '.0/24';
          let hasRoute = false;
          
          for (const router of routers) {
            const rTable = (router.data.routingTable as any[]) || [];
            if (rTable.some(r => r.dest === targetNetwork || r.dest === '0.0.0.0/0')) { 
              hasRoute = true; break; 
            }
          }
          if (hasRoute) { 
            success = true; reason = `【ルーティング成功】L3機器を経由して ${protocol} 通信に成功しました！`; 
          } else { 
            success = false; reason = `【経路なし】L3機器に宛先ネットワーク (${targetNetwork}) への経路が登録されていません。`; 
          }
        }
      }
    }

    if (success && rtaModeRef.current.active && !rtaModeRef.current.completed) {
      const finalTime = rtaModeRef.current.elapsedTime;
      setRtaMode(prev => ({ ...prev, completed: true, active: false }));
      
      setTimeout(() => {
        alert(`🏆 障害復旧 RTA クリア！！\n\nタイム: ${finalTime} 秒\n\nお見事です！ネットワークのトラブルシューティングを完璧に完了しました！`);
      }, 500);
    }

    setPingState(s => ({ ...s, active: false, targetId, status: success ? 'success' : 'fail' }));
    
    const animColor = success ? (protocol === 'TCP' ? '#3b82f6' : protocol === 'UDP' ? '#a855f7' : '#22c55e') : '#ef4444';
    const edgesToAnimate = success ? successPathEdges : edgesRef.current.filter(e => e.source === sourceId || e.target === sourceId).map(e => e.id);

    edgesToAnimate.forEach((edgeId, index) => {
      setTimeout(() => {
        setEdges(eds => eds.map(e => e.id === edgeId ? { 
          ...e, 
          data: { ...e.data, isAnimating: true, animColor },
          style: { ...e.style, stroke: animColor, strokeWidth: 4, filter: `drop-shadow(0 0 8px ${animColor})` }
        } : e));
      }, index * 500);
    });

    const totalAnimTime = edgesToAnimate.length * 500 + 1000;

    setTimeout(() => {
      setPingState({ active: false, sourceId: null, targetId: null, protocol: 'ICMP', port: '', status: 'idle' });
      setEdges(eds => eds.map(edge => {
         const sNode = nodesRef.current.find(n => n.id === edge.source); 
         const tNode = nodesRef.current.find(n => n.id === edge.target);
         const isDown = sNode?.data?.status === 'down' || tNode?.data?.status === 'down' || edge.data?.status === 'down';
         const isInt = sNode?.data?.deviceType === 'クラウド' || tNode?.data?.deviceType === 'クラウド' || String(sNode?.data?.deviceType).includes('AWS') || String(targetNode?.data?.deviceType).includes('AWS');
         return { 
           ...edge, 
           data: { ...edge.data, isAnimating: false },
           style: { 
             ...edge.style, 
             stroke: isDown ? '#94a3b8' : (isInt ? '#ef4444' : (isDarkMode ? '#60a5fa' : '#3b82f6')), 
             strokeWidth: isInt ? 4 : 2.5, 
             strokeDasharray: '5 5', 
             filter: 'none' 
           } 
         };
      }));
      
      setTimeout(() => alert(`⚡ ${protocol} テスト結果: ${success ? '成功 ✅' : '失敗 ❌'}\n\n${reason}`), 50);
      
    }, totalAnimTime);

  }, [pingState, setEdges, isDarkMode]); 

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (pingState.active && pingState.sourceId && node.id !== pingState.sourceId && node.type === 'device') {
      executePing(pingState.sourceId, node.id);
    }
  }, [pingState, executePing]);

  const onNodeDoubleClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type === 'device') {
      setTerminal({
        isOpen: true,
        nodeId: node.id,
        logs: [
          `NetPalette OS v2.0 - Connected to ${node.data.label} (${node.data.ip || 'N/A'})`, 
          `Type 'help' for a list of available commands.`
        ],
        input: ''
      });
    }
  }, []);

  const handleTerminalCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();

    if (e.key === 'Enter' && terminal.input.trim() !== '') {
      const cmd = terminal.input.trim();
      const deviceNode = nodesRef.current.find(n => n.id === terminal.nodeId);
      const newLogs = [...terminal.logs, `admin@${deviceNode?.data.label || 'device'}:~$ ${cmd}`];
      
      if (cmd === 'help') {
        newLogs.push(
          'Available commands:', 
          '  ssh <user>@<IP>  - 🚀 Start REAL SSH session in native terminal', 
          '  ping <IP>        - Send ICMP echo requests', 
          '  show ip route    - Display routing table', 
          '  show power       - Display device power consumption', 
          '  clear            - Clear terminal screen', 
          '  exit             - Close terminal'
        );
      } else if (cmd === 'clear') {
        setTerminal({ ...terminal, logs: [], input: '' }); return;
      } else if (cmd === 'exit') {
        setTerminal({ ...terminal, isOpen: false, input: '' }); return;
      
      } else if (cmd.startsWith('ssh ')) {
        newLogs.push(`🚀 外部ターミナルを起動してSSH接続を開始します: ${cmd}`);
        setTerminal({ ...terminal, logs: newLogs, input: '' });
        
        try {
          await invoke('launch_native_terminal', { cmdStr: cmd });
        } catch (error) {
          setTerminal(prev => ({ ...prev, logs: [...prev.logs, `❌ エラー: ${error}`] }));
        }
        return;

      } else if (cmd === 'show ip route') {
        const rTable = deviceNode?.data.routingTable as any[];
        if (rTable && rTable.length > 0) {
          newLogs.push('Destination        Next Hop');
          rTable.forEach(r => newLogs.push(`${(r.dest+'').padEnd(18)} ${r.nextHop}`));
        } else {
          newLogs.push('Routing table is empty or device is not a router.');
        }
      } else if (cmd === 'show power') {
        newLogs.push(`Current power consumption: ${deviceNode?.data.power || 0} W`);
      } else if (cmd.startsWith('ping ')) {
        const targetIp = cmd.split(' ')[1];
        const targetNode = nodesRef.current.find(n => n.data.ip === targetIp && n.type === 'device');
        if (targetNode && terminal.nodeId) {
          newLogs.push(`PING ${targetIp} 56(84) bytes of data.`);
          setPingState({ active: true, sourceId: terminal.nodeId, targetId: null, protocol: 'ICMP', port: '', status: 'idle' });
          setTimeout(() => executePing(terminal.nodeId!, targetNode.id), 100);
        } else {
          newLogs.push(`ping: ${targetIp}: Destination Host Unreachable`);
        }
      } else {
        newLogs.push(`bash: ${cmd}: command not found`);
      }
      setTerminal({ ...terminal, logs: newLogs, input: '' });
    }
  };

  const openSaveModal = () => {
    const now = new Date();
    const defaultName = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setSnapshotName(defaultName); 
    setShowSaveModal(true);
  };

  const handleSaveSnapshot = () => {
    if (!snapshotName.trim()) return alert('名前を入力してください。');
    const newSnapshot: Snapshot = { 
      id: Date.now().toString(), 
      name: snapshotName.trim(), 
      date: new Date().toLocaleString('ja-JP'), 
      nodes: JSON.parse(JSON.stringify(nodes)), 
      edges: JSON.parse(JSON.stringify(edges)) 
    };
    setSnapshots([newSnapshot, ...snapshots]); 
    setShowSaveModal(false);
  };

  const restoreSnapshot = (snapshot: Snapshot) => {
    if (confirm(`「${snapshot.name}」を復元しますか？\n※現在のキャンバスの状態は失われます。`)) {
      setNodes(snapshot.nodes); 
      setEdges(snapshot.edges); 
      setShowRestoreModal(false);
    }
  };

  const deleteSnapshot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    setSnapshots(snapshots.filter(s => s.id !== id));
  };

  const handleImportJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (Array.isArray(json.nodes) && Array.isArray(json.edges)) {
           setNodes(json.nodes); 
           setEdges(json.edges);
           alert("ネットワーク構成ファイルをインポートしました！");
        } else {
          throw new Error("フォーマットが不正です。");
        }
      } catch (error) { 
        alert("無効なファイルフォーマットです。正しいNetPaletteのJSONを選択してください。"); 
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };

  const exportAsJson = () => {
    const dataStr = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); 
    link.href = url; 
    link.download = `netpalette-backup-${new Date().getTime()}.json`; 
    link.click();
    URL.revokeObjectURL(url); 
  };

  const runLocalScan = async () => {
    try {
      const data = await invoke<{ nodes: AppNode[]; edges: AppEdge[] }>('scan_network');
      
      let myOsInfo = "Unknown OS";
      try {
        const nav = navigator as any;
        if (nav.userAgentData) {
          const uaData = await nav.userAgentData.getHighEntropyValues(['architecture', 'platform', 'platformVersion']);
          myOsInfo = `${uaData.platform} ${uaData.architecture}`;
        } else {
          const ua = navigator.userAgent;
          if (ua.indexOf("Windows") !== -1) myOsInfo = "Windows";
          else if (ua.indexOf("Mac") !== -1) myOsInfo = "macOS";
          else if (ua.indexOf("Linux") !== -1) myOsInfo = "Linux";
        }
      } catch (e) { 
        console.warn('OS情報の取得に失敗', e); 
      }

      const subnetNode = data.nodes.find(n => n.type === 'subnet');
      const devices = data.nodes.filter(n => n.type === 'device' && n.parentId === subnetNode?.id);
      
      if (subnetNode && devices.length > 0) {
        const startX = 40; const startY = 80; const xSpacing = 130; const yOffset = 90;
        devices.forEach((dev, index) => { 
          dev.position = { x: startX + (index * xSpacing), y: startY + (index % 2 === 0 ? 0 : yOffset) }; 
        });
        subnetNode.style = { width: Math.max(startX + (devices.length * xSpacing) + 50, 450), height: 350 };
      }
      
      const formattedEdges = data.edges.map(edge => {
        const sourceNode = data.nodes.find(n => n.id === edge.source);
        const targetNode = data.nodes.find(n => n.id === edge.target);
        const isInternet = sourceNode?.data?.deviceType === 'クラウド' || targetNode?.data?.deviceType === 'クラウド';
        
        return { 
          ...edge, 
          type: 'custom', 
          data: { status: 'up' as const }, 
          style: { 
             stroke: isInternet ? '#ef4444' : '#3b82f6', 
             strokeWidth: isInternet ? 4 : 2.5, 
             strokeDasharray: '5 5' 
          } 
        };
      });

      const formattedNodes = data.nodes.map(n => {
        if (n.type === 'device') {
           let deviceOs = n.data.os || "Unknown";
           if (n.data?.label?.toString().includes('(このPC)')) {
             deviceOs = myOsInfo;
           }

           let macStr = n.data.mac && n.data.mac !== "Unknown" && n.data.mac !== "" ? n.data.mac : "取得不可";
           if (n.id === 'internet') macStr = "N/A";

           return {
             ...n,
             data: {
               ...n.data,
               mac: `${macStr} | OS: ${deviceOs}`,
               os: deviceOs
             }
           };
        }
        return n;
      });

      setNodes(formattedNodes); 
      setEdges(formattedEdges);
    } catch (error) { 
      console.error('スキャンエラー:', error); 
      alert('ネットワークスキャンに失敗しました。'); 
    }
  };

  const onConnect = useCallback((params: Connection | Edge) => {
      const sourceNode = nodesRef.current.find(n => n.id === params.source); 
      const targetNode = nodesRef.current.find(n => n.id === params.target);
      const isInternet = sourceNode?.data?.deviceType === 'クラウド' || targetNode?.data?.deviceType === 'クラウド' || String(sourceNode?.data?.deviceType).includes('AWS') || String(targetNode?.data?.deviceType).includes('AWS');
      const isDown = sourceNode?.data?.status === 'down' || targetNode?.data?.status === 'down';
      
      let distanceLabel = '';
      if (sourceNode && targetNode) {
        const pxDistance = Math.sqrt(Math.pow(sourceNode.position.x - targetNode.position.x, 2) + Math.pow(sourceNode.position.y - targetNode.position.y, 2));
        distanceLabel = `${Math.max(1, Math.round(pxDistance / 50))}m`;
      }
      
      setEdges((eds) => addEdge({
        ...params, 
        type: 'custom', 
        id: `e-${params.source}-${params.target}-${Date.now()}`, 
        data: { status: 'up' as const }, 
        label: distanceLabel,
        labelBgStyle: { fill: isDarkMode ? '#1e293b' : '#f8fafc', color: isDarkMode ? '#94a3b8' : '#64748b', fillOpacity: 0.9 },
        labelStyle: { fill: isDarkMode ? '#cbd5e1' : '#475569', fontSize: 10, fontWeight: 'bold' }, 
        style: { 
          stroke: isDown ? '#94a3b8' : (isInternet ? '#ef4444' : (isDarkMode ? '#60a5fa' : '#3b82f6')), 
          strokeWidth: isInternet ? 4 : 2.5, 
          strokeDasharray: '5 5', 
          opacity: isDown ? 0.5 : 1 
        }, 
        zIndex: -2,
      }, eds));
  }, [setEdges, isDarkMode]);

  const updateNodeData = (idOrIds: string | string[], newData: Record<string, unknown>) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setNodes((nds) => nds.map((node) => ids.includes(node.id) ? { ...node, data: { ...node.data, ...newData } } : node));
  };

  const deleteNode = useCallback((idOrIds: string | string[]) => {
    if (isLocked) return;
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setNodes((nds) => {
      let updatedNodes = nds.filter((node) => !ids.includes(node.id));
      ids.forEach(id => {
        const targetNode = nds.find(n => n.id === id);
        if (targetNode?.type === 'subnet') {
          updatedNodes = updatedNodes.map(n => n.parentId === id ? { 
            ...n, 
            parentId: undefined, 
            extent: undefined, 
            position: { 
              x: n.position.x + ((targetNode as any).positionAbsolute?.x ?? targetNode.position.x), 
              y: n.position.y + ((targetNode as any).positionAbsolute?.y ?? targetNode.position.y) 
            } 
          } : n);
        }
      });
      return updatedNodes;
    });
    setEdges((eds) => eds.filter((edge) => !ids.includes(edge.source) && !ids.includes(edge.target)));
  }, [setNodes, setEdges, isLocked]);

  const handleExport = (format: 'png' | 'pdf') => {
    if (!reactFlowWrapper.current) return;
    const element = reactFlowWrapper.current.querySelector('.react-flow') as HTMLElement;
    if (format === 'png') exportToPNG(element);
    if (format === 'pdf') exportToPDF(element);
  };

  return (
    <div 
      className={`flex flex-col h-screen w-full transition-colors duration-300 ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}
      onPointerMove={handlePointerMove}
    >
      <input type="file" ref={fileInputRef} onChange={handleImportJson} accept=".json" className="hidden" />

      {/* 🌟 設定モーダル UI */}
      {showSettingsModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)}>
          <div className={`w-[550px] flex flex-col rounded-xl shadow-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'} overflow-hidden`} onClick={e => e.stopPropagation()}>
            
            <div className={`flex justify-between items-center px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20}/> アプリケーション設定</h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-500 hover:text-red-500 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex flex-1 h-[350px]">
              {/* サイドバータブ */}
              <div className={`w-1/3 border-r ${isDarkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
                <button onClick={() => setActiveSettingsTab('general')} className={`w-full text-left px-4 py-3 font-bold text-sm border-l-4 transition-colors ${activeSettingsTab === 'general' ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-transparent hover:bg-slate-500/10'}`}>一般・UI設定</button>
                <button onClick={() => setActiveSettingsTab('zabbix')} className={`w-full text-left px-4 py-3 font-bold text-sm border-l-4 transition-colors ${activeSettingsTab === 'zabbix' ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-transparent hover:bg-slate-500/10'}`}>Zabbix 連携</button>
              </div>

              {/* タブコンテンツ */}
              <div className="w-2/3 p-6 overflow-y-auto space-y-6">
                
                {/* 一般設定タブ */}
                {activeSettingsTab === 'general' && (
                  <div className="space-y-6 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-2"><Moon size={16}/> ダークモード</span>
                      <button onClick={() => setIsDarkMode(!isDarkMode)} className={`w-11 h-6 rounded-full relative transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-slate-300'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`}></div>
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-2"><Wifi size={16}/> 電波マップの表示</span>
                      <button onClick={() => setShowWifiHeatmap(!showWifiHeatmap)} className={`w-11 h-6 rounded-full relative transition-colors ${showWifiHeatmap ? 'bg-blue-600' : 'bg-slate-300'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${showWifiHeatmap ? 'translate-x-6' : 'translate-x-1'}`}></div>
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-2"><MonitorDot size={16}/> Live監視モード</span>
                      <button onClick={() => setIsLiveMode(!isLiveMode)} className={`w-11 h-6 rounded-full relative transition-colors ${isLiveMode ? 'bg-blue-600' : 'bg-slate-300'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${isLiveMode ? 'translate-x-6' : 'translate-x-1'}`}></div>
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Zabbix連携設定タブ */}
                {activeSettingsTab === 'zabbix' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold mb-1 opacity-80">Zabbix API URL</label>
                      <input 
                        type="text" 
                        value={zabbixUrl} 
                        onChange={e => setZabbixUrl(e.target.value)} 
                        placeholder="http://192.168.1.100/zabbix/api_jsonrpc.php" 
                        className={`w-full px-3 py-2 border rounded-md text-sm outline-none transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'}`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1 opacity-80">API Token (またはSession ID)</label>
                      <input 
                        type="password" 
                        value={zabbixToken} 
                        onChange={e => setZabbixToken(e.target.value)} 
                        placeholder="••••••••••••••••" 
                        className={`w-full px-3 py-2 border rounded-md text-sm outline-none transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'}`}
                      />
                    </div>
                    <div className={`text-xs p-3 rounded-md font-bold ${isDarkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                      ℹ️ ここに入力した設定は自動保存されます。<br/>Live監視モードをオンにすると、ここで指定したサーバーから対象デバイスのメトリクス（CPU/Temp）を取得します。
                    </div>
                  </div>
                )}

              </div>
            </div>
            
            <div className={`p-4 border-t flex justify-end ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
              <button onClick={() => setShowSettingsModal(false)} className="px-5 py-2 bg-blue-600 text-white rounded-md font-bold text-sm shadow hover:bg-blue-500 transition-colors">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* --- (既存のターミナル・Cursor・Ping・コマンドパレット・スナップショットモーダルはそのまま) --- */}
      {terminal.isOpen && (
        <div className="absolute bottom-0 left-0 w-[calc(100%-450px)] h-64 bg-slate-950 border-t-2 border-slate-700 shadow-2xl z-50 flex flex-col font-mono text-xs transition-all duration-300">
          <div className="flex justify-between items-center px-4 py-2 bg-slate-800 text-slate-300 border-b border-slate-700">
            <span className="flex items-center gap-2 font-bold"><TerminalSquare size={14}/> CLI Terminal - {nodes.find(n => n.id === terminal.nodeId)?.data.label}</span>
            <button onClick={() => setTerminal({...terminal, isOpen: false})} className="hover:text-red-500 transition-colors"><X size={14}/></button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto text-green-400">
            {terminal.logs.map((log, i) => <div key={i} className="whitespace-pre-wrap">{log}</div>)}
            <div className="flex mt-1">
              <span className="mr-2 text-green-500">admin@{nodes.find(n => n.id === terminal.nodeId)?.data.label || 'device'}:~$</span>
              <input 
                type="text" 
                value={terminal.input} 
                onChange={e => setTerminal({...terminal, input: e.target.value})} 
                onKeyDown={handleTerminalCommand}
                onKeyUp={e => e.stopPropagation()} 
                onKeyPress={e => e.stopPropagation()}
                className="flex-1 bg-transparent outline-none text-green-400" 
                autoFocus 
              />
            </div>
          </div>
        </div>
      )}

      {isMultiplayer && Array.from(cursors.entries()).map(([id, state]) => {
        if (id === myClientId || !state?.cursor) return null;
        return (
          <div key={id} style={{ position: 'absolute', left: state.cursor.x, top: state.cursor.y, pointerEvents: 'none', zIndex: 9999, transition: 'left 0.1s linear, top 0.1s linear' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.65376 21.5L2.5 2.5L21.5 10.9634L13.1465 13.5654L10.874 21.1118L5.65376 21.5Z" fill="#eab308" stroke="#fff" strokeWidth="2" /></svg>
            <div className="bg-yellow-500 text-white px-2 py-0.5 rounded-full text-[10px] mt-1 font-bold shadow-md w-max">
              {state.user?.name || `Guest-${id.toString().slice(-3)}`}
            </div>
          </div>
        );
      })}

      {rtaMode.active && (
        <div className="absolute top-20 right-6 bg-slate-900/90 text-white px-4 py-2 rounded-lg shadow-2xl border-2 border-purple-500 z-50 flex flex-col items-center animate-pulse">
          <span className="text-[10px] font-bold text-purple-400 mb-1">RTA MODE (Ping Test)</span>
          <span className="text-2xl font-mono font-black">{Math.floor(rtaMode.elapsedTime / 60).toString().padStart(2, '0')}:{(rtaMode.elapsedTime % 60).toString().padStart(2, '0')}</span>
        </div>
      )}
      {rtaMode.completed && (
        <div className="absolute top-20 right-6 bg-yellow-500 text-slate-900 px-4 py-3 rounded-lg shadow-2xl border-2 border-yellow-300 z-50 flex flex-col items-center animate-bounce cursor-pointer hover:bg-yellow-400" onClick={() => setRtaMode(prev => ({...prev, completed: false}))}>
          <span className="text-[10px] font-bold mb-1 flex items-center gap-1"><Trophy size={12}/> CLEAR! (Click to dismiss)</span>
          <span className="text-2xl font-mono font-black">{Math.floor(rtaMode.elapsedTime / 60).toString().padStart(2, '0')}:{(rtaMode.elapsedTime % 60).toString().padStart(2, '0')}</span>
        </div>
      )}

      {pingState.active && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-2.5 rounded-full shadow-2xl z-50 flex items-center gap-3 animate-bounce border-2 border-blue-500/50">
          <Zap size={18} className="text-yellow-400 fill-yellow-400" />
          <select value={pingState.protocol} onChange={e => setPingState(s => ({...s, protocol: e.target.value as SimProtocol}))} className="bg-slate-900 text-white text-xs p-1.5 rounded border border-slate-600 outline-none font-bold">
             <option value="ICMP">Ping (ICMP)</option>
             <option value="TCP">TCP</option>
             <option value="UDP">UDP</option>
          </select>
          {(pingState.protocol === 'TCP' || pingState.protocol === 'UDP') && (
             <input type="number" placeholder="Port (例: 80)" value={pingState.port} onChange={e => setPingState(s => ({...s, port: e.target.value}))} className="bg-slate-900 text-white text-xs w-24 p-1.5 rounded border border-slate-600 outline-none" />
          )}
          <span className="font-bold text-sm ml-2">🎯 宛先デバイスをクリックしてください (Escでキャンセル)</span>
        </div>
      )}

      {showCmdPalette && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowCmdPalette(false)}>
          <div className={`w-[500px] rounded-xl shadow-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-4`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b pb-3 mb-3 border-slate-500/20">
              <Command size={18} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
              <input type="text" placeholder="コマンドを入力... (Escで閉じる)" autoFocus className={`w-full bg-transparent outline-none text-lg font-bold ${isDarkMode ? 'text-white placeholder-slate-500' : 'text-slate-800 placeholder-slate-400'}`} />
            </div>
            <div className="space-y-1">
              <button onClick={() => { runLocalScan(); setShowCmdPalette(false); }} className={`w-full text-left px-3 py-2 rounded font-bold text-sm ${isDarkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}>🔍 ネットワークをスキャン</button>
              <button onClick={() => { openSaveModal(); setShowCmdPalette(false); }} className={`w-full text-left px-3 py-2 rounded font-bold text-sm ${isDarkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}>📸 構成スナップショットを保存</button>
              <button onClick={() => { setIsDarkMode(!isDarkMode); setShowCmdPalette(false); }} className={`w-full text-left px-3 py-2 rounded font-bold text-sm ${isDarkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}>🌙 ダークモード切替</button>
              <button onClick={startRtaMode} className={`w-full text-left px-3 py-2 mt-2 rounded font-bold text-sm flex items-center gap-2 transition-colors ${isDarkMode ? 'hover:bg-purple-900/50 text-purple-400' : 'hover:bg-purple-100 text-purple-600'}`}>
                <PlayCircle size={16} /> 🎮 障害復旧RTAモードを開始
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowSaveModal(false)}>
          <div className={`w-[400px] rounded-xl shadow-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'} p-5`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2"><Save size={18}/>スナップショット保存</h3>
              <button onClick={() => setShowSaveModal(false)} className="text-slate-500 hover:text-red-500"><X size={18}/></button>
            </div>
            <input type="text" placeholder="名前" value={snapshotName} onChange={e => setSnapshotName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveSnapshot()} className={`w-full px-3 py-2 border rounded-md mb-4 outline-none ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300'}`} autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveModal(false)} className={`px-4 py-2 rounded text-sm font-bold ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>キャンセル</button>
              <button onClick={handleSaveSnapshot} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold shadow hover:bg-blue-500">保存する</button>
            </div>
          </div>
        </div>
      )}

      {showRestoreModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowRestoreModal(false)}>
          <div className={`w-[500px] max-h-[80vh] flex flex-col rounded-xl shadow-2xl border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'} p-5`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2"><RotateCcw size={18}/>復元</h3>
              <button onClick={() => setShowRestoreModal(false)} className="text-slate-500 hover:text-red-500"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {snapshots.length === 0 ? (
                <div className={`text-center py-8 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>履歴なし</div>
              ) : (
                snapshots.map(snap => (
                  <div key={snap.id} onClick={() => restoreSnapshot(snap)} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer ${isDarkMode ? 'border-slate-700 bg-slate-900 hover:border-blue-500' : 'border-slate-200 bg-slate-50 hover:border-blue-400'}`}>
                    <div>
                      <div className="font-bold text-sm">{snap.name}</div>
                      <div className="text-[10px] mt-1 opacity-60">{snap.date}</div>
                    </div>
                    <button onClick={(e) => deleteSnapshot(snap.id, e)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded">
                      <Trash2 size={16}/>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <header className={`${isDarkMode ? 'bg-slate-900 border-b border-slate-800' : 'bg-[#1a2332] shadow-md'} text-white px-6 py-3 flex items-center justify-between z-10 transition-colors duration-300`}>
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold tracking-wider">NetPalette</span>
          <span className="text-[10px] bg-blue-600 px-2 py-0.5 rounded-full font-bold shadow border border-blue-400">v2.0 Ultimate</span>
          {isLocked && <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold border border-red-500/50 ml-2">🔒 編集ロック中</span>}
        </div>
        
        <div className="flex gap-2 items-center">
          
          {/* 🌟 追加: アプリケーション設定ボタン */}
          <button onClick={() => setShowSettingsModal(true)} className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-md text-[11px] font-bold shadow flex items-center gap-1.5 transition-colors border border-slate-700 mr-4 text-slate-300">
            <Settings size={14}/> 設定
          </button>

          <button onClick={() => fileInputRef.current?.click()} className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-md text-[11px] font-bold shadow flex items-center gap-1.5 transition-colors border border-slate-700 text-blue-300">
            <Upload size={14}/> 読込
          </button>
          <button onClick={exportAsJson} className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-md text-[11px] font-bold shadow flex items-center gap-1.5 transition-colors border border-slate-700 mr-2 text-green-300">
            <Download size={14}/> 書出
          </button>

          <button onClick={openSaveModal} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-md text-[11px] font-bold shadow flex items-center gap-1.5 transition-colors border border-slate-600">
            <Save size={14}/> 履歴保存
          </button>
          <button onClick={() => setShowRestoreModal(true)} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-md text-[11px] font-bold shadow flex items-center gap-1.5 transition-colors border border-slate-600 mr-4">
            <RotateCcw size={14}/> 復元 ({snapshots.length})
          </button>
          
          {/* ヘッダー上の簡易トグルは維持 */}
          <button onClick={() => setShowWifiHeatmap(!showWifiHeatmap)} className={`px-4 py-2 rounded-md text-[11px] font-bold shadow-lg flex items-center gap-1.5 transition-all mr-2 ${showWifiHeatmap ? 'bg-blue-600 text-white' : 'bg-slate-800 text-blue-400 border border-slate-700 hover:bg-slate-700'}`}>
            <Wifi size={14}/> 電波マップ
          </button>

          <button onClick={() => setIsMultiplayer(!isMultiplayer)} className={`px-4 py-2 rounded-md text-[11px] font-bold shadow-lg flex items-center gap-1.5 transition-all mr-2 ${
              isMultiplayer ? (wsStatus === 'connected' ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(22,197,94,0.5)]' : 'bg-yellow-600 text-white animate-pulse') : 'bg-slate-800 text-yellow-500 border border-slate-700 hover:bg-slate-700'
            }`}>
            <Users size={14}/> {isMultiplayer ? (wsStatus === 'connected' ? 'Synced (Online)' : 'Connecting...') : 'Multiplayer'}
          </button>

          {isMultiplayer && wsStatus === 'connected' && (
            <div className="flex items-center bg-slate-800 rounded-md border border-slate-600 mr-2 overflow-hidden shadow">
              <span className="px-2 py-1.5 text-[10px] text-slate-300 border-r border-slate-600 bg-slate-900/50 font-mono">Room: {roomId.split('-')[1]}</span>
              <button onClick={() => { navigator.clipboard.writeText(roomUrl); alert('共有リンクをコピーしました！'); }} className="px-3 py-1.5 text-[11px] font-bold text-blue-400 hover:bg-slate-700 transition-colors">🔗 リンクをコピー</button>
            </div>
          )}

          <button onClick={() => setIsLiveMode(!isLiveMode)} className={`px-4 py-2 rounded-md text-[11px] font-bold shadow-lg flex items-center gap-2 transition-all ml-2 border ${
              isLiveMode ? 'bg-red-600 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-slate-800 border-slate-700 text-red-400 hover:bg-slate-700'
            }`}>
            <span className="relative flex h-2.5 w-2.5">
              {isLiveMode && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLiveMode ? 'bg-white' : 'bg-red-500'}`}></span>
            </span>
            {isLiveMode ? 'Live監視中' : '監視OFF'}
          </button>

          <button onClick={runLocalScan} className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-md text-sm font-bold shadow-lg flex items-center gap-2 transition-all ml-2 relative overflow-hidden group">
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-blue-400/0 via-blue-400/30 to-blue-400/0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-200 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            スキャン
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden h-full">
        <ReactFlowProvider>
          <div className="flex-1 h-full w-full relative" ref={reactFlowWrapper}>
            <Canvas 
              nodes={nodesWithHeatmap} 
              edges={edges} 
              onNodesChange={onNodesChange} 
              onEdgesChange={onEdgesChange} 
              onConnect={onConnect} 
              setNodes={setNodes} 
              deleteNode={deleteNode} 
              isLocked={isLocked} 
              searchQuery={searchQuery} 
              isDarkMode={isDarkMode} 
              onNodeClick={onNodeClick} 
              onNodeDoubleClick={onNodeDoubleClick} 
            />
          </div>
          <Sidebar 
            onExport={handleExport} 
            updateNodeData={updateNodeData}
            updateEdgeData={updateEdgeData} 
            nodes={nodes} 
            edges={edges} 
            setNodes={setNodes} 
            deleteNode={deleteNode}
            deleteEdge={deleteEdge}
            isLocked={isLocked} 
            setIsLocked={setIsLocked} 
            searchQuery={searchQuery} 
            setSearchQuery={setSearchQuery} 
            isDarkMode={isDarkMode} 
            setIsDarkMode={setIsDarkMode} 
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}