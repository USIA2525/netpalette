import React, { useState, useEffect } from 'react';
import { Calculator } from 'lucide-react';

export const SubnetCalculator: React.FC = () => {
  const [ip, setIp] = useState<string>('192.168.1.0');
  const [cidr, setCidr] = useState<number>(24);
  const [result, setResult] = useState<{
    network: string;
    broadcast: string;
    mask: string;
    hosts: number;
  } | null>(null);

  useEffect(() => {
    calculateSubnet();
  }, [ip, cidr]);

  const calculateSubnet = () => {
    try {
      const ipParts = ip.split('.').map(Number);
      if (ipParts.length !== 4 || ipParts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        setResult(null);
        return;
      }
      if (cidr < 0 || cidr > 32) {
        setResult(null);
        return;
      }

      // JavaScriptの32bit符号付き整数のオーバーフローを避けるため、2進数文字列で処理
      const maskBin = ''.padStart(cidr, '1').padEnd(32, '0');
      const ipBin = ipParts.map((p) => p.toString(2).padStart(8, '0')).join('');

      const networkBin = ipBin.substring(0, cidr) + ''.padStart(32 - cidr, '0');
      const broadcastBin = ipBin.substring(0, cidr) + ''.padStart(32 - cidr, '1');

      const binToIp = (bin: string) => {
        return [
          parseInt(bin.substring(0, 8), 2),
          parseInt(bin.substring(8, 16), 2),
          parseInt(bin.substring(16, 24), 2),
          parseInt(bin.substring(24, 32), 2),
        ].join('.');
      };

      setResult({
        network: binToIp(networkBin),
        broadcast: binToIp(broadcastBin),
        mask: binToIp(maskBin),
        hosts: cidr >= 31 ? 0 : Math.pow(2, 32 - cidr) - 2,
      });
    } catch (error) {
      setResult(null);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 md:p-6 mb-8 border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">サブネット計算ツール</h2>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            IPアドレス
          </label>
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100 transition-colors"
            placeholder="例: 192.168.1.0"
          />
        </div>
        <div className="w-full md:w-32">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            プレフィックス長
          </label>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-bold">/</span>
            <input
              type="number"
              value={cidr}
              min="0"
              max="32"
              onChange={(e) => setCidr(Number(e.target.value))}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100 transition-colors"
            />
          </div>
        </div>
      </div>

      {result ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">ネットワークアドレス</p>
            <p className="font-mono font-bold text-slate-800 dark:text-slate-100">{result.network}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">ブロードキャストアドレス</p>
            <p className="font-mono font-bold text-slate-800 dark:text-slate-100">{result.broadcast}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">サブネットマスク</p>
            <p className="font-mono font-bold text-slate-800 dark:text-slate-100">{result.mask}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">最大ホスト数</p>
            <p className="font-mono font-bold text-slate-800 dark:text-slate-100">{result.hosts} 台</p>
          </div>
        </div>
      ) : (
        <div className="text-sm text-red-500 dark:text-red-400 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          正しいIPアドレスとプレフィックス長を入力してください。
        </div>
      )}
    </div>
  );
};