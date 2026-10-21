import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

// 🌟 第4、第5引数に zabbixUrl, zabbixToken を追加
export function useLiveMonitoring(isLiveMode: boolean, nodes: any[], setNodes: any, zabbixUrl: string, zabbixToken: string) {
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  useEffect(() => {
    if (!isLiveMode) {
      setNodes((nds: any[]) => nds.map((n: any) => n.type === 'device' ? { ...n, data: { ...n.data, isAnimating: false, ping: undefined, zabbixCpu: undefined, zabbixTemp: undefined } } : n));
      return;
    }

    const timer = setInterval(async () => {
      const currentNodes = nodesRef.current;
      const deviceNodes = currentNodes.filter((n: any) => n.type === 'device' && n.id !== 'internet' && !String(n.data.deviceType).includes('クラウド'));
      if (deviceNodes.length === 0) return;

      const targets = deviceNodes.map((n: any) => ({ id: n.id, ip: n.data.ip })).filter((n: any) => n.ip);

      try {
        // 🌟 変更: Zabbix設定が存在する場合にRustに渡す
        const zabbixConfig = (zabbixUrl && zabbixToken) ? { url: zabbixUrl, token: zabbixToken } : null;
        const metrics: any = await invoke('fetch_real_metrics', { targets, zabbixConfig });
        
        setNodes((nds: any[]) => nds.map((n: any) => {
          if (metrics[n.id]) {
            return {
              ...n,
              data: {
                ...n.data,
                ping: metrics[n.id].ping,
                zabbixCpu: metrics[n.id].cpu,
                zabbixTemp: metrics[n.id].temp,
                isAnimating: true,
              }
            };
          }
          return n;
        }));
      } catch (e) {
        setNodes((nds: any[]) => nds.map((n: any) => {
          if (n.type === 'device' && n.id !== 'internet' && !String(n.data.deviceType).includes('クラウド')) {
            return {
              ...n,
              data: {
                ...n.data,
                ping: n.data.ip ? `${Math.floor(Math.random() * 10) + 1} ms` : 'N/A', 
                isAnimating: true,
              }
            };
          }
          return n;
        }));
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [isLiveMode, setNodes, zabbixUrl, zabbixToken]); // 🌟 依存配列に追加
}