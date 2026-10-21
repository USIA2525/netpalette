import { AppNode, AppEdge } from '../types';

export type RtaScenario = {
  id: string;
  title: string;
  description: string;
  nodes: AppNode[];
  edges: AppEdge[];
};

export const sampleRtaScenario: RtaScenario = {
  id: 'scenario-1',
  title: '🔴 初級: ルーティングとVLANの不整合を直せ！',
  description: 'PC1からデータベースへの通信が失敗しています。L3スイッチのルーティングテーブルの欠落と、VLANのミスマッチを修正してPingを通してください。',
  nodes: [
    {
      id: 'sub-1',
      type: 'subnet',
      position: { x: 50, y: 50 },
      style: { width: 400, height: 300 },
      data: { label: '本社ネットワーク', cidr: '/24' }
    },
    {
      id: 'pc-1',
      type: 'device',
      parentId: 'sub-1',
      position: { x: 50, y: 80 },
      data: { deviceType: 'PC', label: 'PC-01 (クライアント)', ip: '192.168.1.10', vlan: '10', power: 30 }
    },
    {
      id: 'db-1',
      type: 'device',
      parentId: 'sub-1',
      position: { x: 220, y: 80 },
      data: { deviceType: 'DB', label: 'DB-Server', ip: '192.168.2.50', vlan: '20', power: 250 } // ⚠️ VLANが違う！
    },
    {
      id: 'l3-1',
      type: 'device',
      position: { x: 200, y: 380 },
      data: { deviceType: 'L3SW', label: 'Core-L3SW', ip: '192.168.1.1', power: 50, routingTable: [] } // ⚠️ ルーティングテーブルが空！
    }
  ],
  edges: [
    { id: 'e1', source: 'pc-1', target: 'l3-1', type: 'custom', data: { status: 'up' } },
    { id: 'e2', source: 'db-1', target: 'l3-1', type: 'custom', data: { status: 'up' } }
  ]
};