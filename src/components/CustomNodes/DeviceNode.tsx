import { Handle, Position, useReactFlow } from '@xyflow/react';
import { Power, Zap, Server, Monitor, Smartphone, Router, Network, Cloud, Shield, Database, Layers, Wifi, Computer, Box, Activity, Thermometer, Radio } from 'lucide-react';
import { useState } from 'react';

export default function DeviceNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow();
  const [isHovered, setIsHovered] = useState(false);

  const isDown = data.status === 'down';
  const isDarkMode = data.isDarkMode;
  
  // 🌟 Live Monitoring 用のデータを抽出
  const { ping, traffic, zabbixCpu, zabbixTemp, isAlert, deviceType } = data;
  
  // 🌟 インターネットやクラウドノードかどうかを判定
  const isCloudOrInternet = id === 'internet' || String(deviceType).includes('クラウド') || String(deviceType).includes('AWS');

  const togglePower = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(id, { status: isDown ? 'up' : 'down' });
  };

  const startPing = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('start-ping', { detail: { sourceId: id } }));
  };

  const getIcon = () => {
    if (data.customIcon) return <img src={data.customIcon} alt="icon" className="w-10 h-10 object-contain" />;
    const s = 32;
    const color = isDarkMode ? '#cbd5e1' : '#334155';
    switch(deviceType) {
      case 'サーバー': return <Server size={s} color={color} />;
      case 'PC': return <Monitor size={s} color={color} />;
      case 'スマホ': return <Smartphone size={s} color={color} />;
      case 'ルーター': return <Router size={s} color={color} />;
      case 'スイッチ': return <Network size={s} color={color} />;
      case 'クラウド': return <Cloud size={s} color="#3b82f6" />;
      case 'FW': return <Shield size={s} color="#f97316" />;
      case 'DB': return <Database size={s} color={color} />;
      case 'L3SW': return <Layers size={s} color={color} />;
      case 'Wi-Fi': return <Wifi size={s} color={color} />;
      case 'VM': return <Computer size={s} color="#a855f7" />;
      case 'コンテナ': return <Box size={s} color="#a855f7" />;
      default: return <Monitor size={s} color={color} />;
    }
  };

  const alertClasses = isAlert ? '!border-red-500 ring-4 ring-red-500/50 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.8)]' : '';

  return (
    <div 
      className={`relative rounded-xl border-2 p-3 w-32 h-auto min-h-[7rem] flex flex-col items-center justify-center transition-all bg-opacity-90 backdrop-blur-sm shadow-sm
        ${isDarkMode ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-800'} 
        ${selected ? (isDarkMode ? '!border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.3)]' : '!border-blue-500 shadow-lg') : ''} 
        ${isDown ? 'opacity-40 grayscale border-dashed' : ''}
        ${data.auditWarning ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : ''}
        ${alertClasses}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 監査警告バッジ */}
      {data.auditWarning && (
         <div className="absolute -top-2 -right-2 bg-yellow-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs shadow-md animate-pulse z-10">!</div>
      )}

      {/* クリティカルアラートバッジ */}
      {isAlert && (
        <div className="absolute -top-3 -left-3 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg animate-bounce z-10">
          CRITICAL
        </div>
      )}

      <Handle type="target" position={Position.Top} className="opacity-0 w-full h-1/2 top-0 !bg-transparent rounded-none border-none z-0" />
      
      {/* ツールバー */}
      <div className={`absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white rounded-lg p-2 flex gap-2 items-center shadow-xl transition-all duration-200 z-50 pointer-events-auto border border-slate-700
        ${isHovered ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-2 invisible'}`}>
        <button onClick={togglePower} className={`p-1.5 rounded-md transition-colors ${isDown ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'bg-green-500/20 text-green-400 hover:bg-green-500/40'}`} title={isDown ? "電源ON" : "電源OFF"}>
          <Power size={16} />
        </button>
        <button onClick={startPing} disabled={isDown} className={`p-1.5 rounded-md transition-colors ${isDown ? 'text-slate-500 cursor-not-allowed' : 'bg-blue-500/20 text-yellow-400 hover:bg-blue-500/40'}`} title="通信テスト (Ping/TCP/UDP)">
          <Zap size={16} />
        </button>
        <div className="w-[1px] h-8 bg-slate-700 mx-1"></div>
        <div className="flex flex-col text-[9px] whitespace-nowrap px-1 font-mono text-slate-300 text-left leading-tight">
          <span className="text-white font-bold">{deviceType}</span>
          <span>{data.ip} {data.vlan ? `(VLAN:${data.vlan})` : ''}</span>
          <span className="text-[8px] text-slate-400">{data.mac || '00:00:00:00:00:00'}</span>
        </div>
      </div>

      <div className="mb-2">
         {getIcon()}
      </div>
      <div className="text-[11px] font-bold text-center leading-tight truncate w-full">
        {data.label}
      </div>
      <div className="text-[9px] font-mono opacity-60 text-center mt-1 truncate w-full">
        {data.ip}
      </div>

      {/* 🌟 監視メトリクス表示部: クラウド/インターネットではなく、電源ONで、かつデータがある場合のみ表示 */}
      {!isCloudOrInternet && !isDown && (ping !== undefined || zabbixCpu !== undefined) && (
        <div className={`mt-2 pt-2 border-t w-full text-[9px] font-mono grid gap-1 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          
          {/* 通常時のPing表示 */}
          {ping !== undefined && (
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-0.5"><Radio size={10}/> Ping</span>
              <span className="font-bold">{ping} ms</span>
            </div>
          )}

          {/* 通常時のTraffic表示 */}
          {traffic !== undefined && (
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-0.5"><Network size={10}/> Traffic</span>
              <span className="font-bold">{traffic} Mbps</span>
            </div>
          )}

          {/* Zabbix連携時: CPU使用率 */}
          {zabbixCpu !== undefined && (
            <>
              <div className="flex justify-between items-center mt-1">
                <span className={`flex items-center gap-0.5 ${zabbixCpu >= 80 ? 'text-red-400 font-bold' : (isDarkMode ? 'text-blue-400' : 'text-blue-600')}`}><Activity size={10}/> CPU</span>
                <span className={zabbixCpu >= 80 ? 'text-red-400 font-bold' : ''}>{zabbixCpu}%</span>
              </div>
              <div className={`w-full rounded-full h-1 ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                <div className={`h-1 rounded-full ${zabbixCpu >= 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${zabbixCpu}%` }}></div>
              </div>
            </>
          )}

          {/* Zabbix連携時: 温度 */}
          {zabbixTemp !== undefined && (
            <div className="flex justify-between items-center mt-0.5">
              <span className={`flex items-center gap-0.5 ${zabbixTemp >= 70 ? 'text-orange-500 font-bold' : 'text-slate-500'}`}><Thermometer size={10}/> Temp</span>
              <span className={zabbixTemp >= 70 ? 'text-orange-500 font-bold' : 'text-slate-500'}>{zabbixTemp}℃</span>
            </div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0 w-full h-1/2 bottom-0 !bg-transparent rounded-none border-none z-0" />
    </div>
  );
}