import { AppNode, AppEdge } from '../types';

export type RtaScenario = {
  id: string;
  title: string;
  description: string;
  difficulty: 1 | 2 | 3;
  nodes: AppNode[];
  edges: AppEdge[];
};

// ランダムなIPやVLANを生成するヘルパー
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randIp = (thirdOctet: number) => `192.168.${thirdOctet}.${rand(10, 200)}`;

// 🌟 1問を動的に生成するコア関数
export const generateSingleScenario = (scenarioId: number, difficulty: 1 | 2 | 3): RtaScenario => {
  const vlanA = rand(10, 30).toString();
  const vlanB = (parseInt(vlanA) + rand(1, 5)).toString();
  
  if (difficulty === 1) {
    // ==========================================
    // 🟢 初級 (難易度1): L2/IPレイヤーのトラブル
    // トポロジー: 同一サブネット内のPCとサーバー
    // トラブル: VLANの不一致
    // ==========================================
    return {
      id: `rta-${scenarioId}`,
      difficulty: 1,
      title: `🟢 初級 #${scenarioId}: L2通信の断絶`,
      description: `PCから社内サーバーへの通信ができません。L2スイッチ(または設定)を確認し、VLAN IDの不整合を直してPingを通してください。`,
      nodes: [
        { id: 'sub1', type: 'subnet', position: { x: 50, y: 50 }, style: { width: 350, height: 250 }, data: { label: '社内ネットワーク', cidr: '192.168.1.0/24' }, zIndex: -1 },
        { id: 'pc1', type: 'device', parentId: 'sub1', position: { x: 50, y: 50 }, data: { deviceType: 'PC', label: 'Client-PC', ip: '192.168.1.10', vlan: vlanA, power: 30 } },
        { id: 'srv1', type: 'device', parentId: 'sub1', position: { x: 200, y: 50 }, data: { deviceType: 'サーバー', label: 'File-Server', ip: '192.168.1.20', vlan: vlanB, power: 150 } } // ⚠️ 意図的なVLANミス
      ],
      edges: [
        { id: 'e1', source: 'pc1', target: 'srv1', type: 'custom', data: { status: 'up' } }
      ]
    };
  } 
  
  else if (difficulty === 2) {
    // ==========================================
    // 🟡 中級 (難易度2): ルーティングレイヤーのトラブル
    // トポロジー: 別サブネット間の通信 (PC -> Router -> DB)
    // トラブル: ルーターの経路欠落 または 回線断
    // ==========================================
    const isLinkDown = Math.random() > 0.5;
    return {
      id: `rta-${scenarioId}`,
      difficulty: 2,
      title: `🟡 中級 #${scenarioId}: L3到達不能`,
      description: `別拠点のデータベースに繋がりません。ルーターの「ルーティングテーブル」または「物理回線の状態」を修正してPingを通してください。`,
      nodes: [
        { id: 'sub1', type: 'subnet', position: { x: 20, y: 50 }, style: { width: 250, height: 250 }, data: { label: '拠点A', cidr: '192.168.1.0/24' }, zIndex: -1 },
        { id: 'sub2', type: 'subnet', position: { x: 450, y: 50 }, style: { width: 250, height: 250 }, data: { label: '拠点B (DC)', cidr: '192.168.2.0/24' }, zIndex: -1 },
        { id: 'pc1', type: 'device', parentId: 'sub1', position: { x: 50, y: 50 }, data: { deviceType: 'PC', label: 'Admin-PC', ip: '192.168.1.15', vlan: '1', power: 30 } },
        { id: 'rt1', type: 'device', position: { x: 300, y: 80 }, data: { deviceType: 'ルーター', label: 'Core-Router', ip: '192.168.1.254', power: 50, routingTable: [] } }, // ⚠️ 経路なし
        { id: 'db1', type: 'device', parentId: 'sub2', position: { x: 50, y: 50 }, data: { deviceType: 'DB', label: 'Main-DB', ip: '192.168.2.100', vlan: '1', power: 250 } }
      ],
      edges: [
        { id: 'e1', source: 'pc1', target: 'rt1', type: 'custom', data: { status: 'up' } },
        { id: 'e2', source: 'rt1', target: 'db1', type: 'custom', data: { status: isLinkDown ? 'down' : 'up' } } // ⚠️ ランダムで断線
      ]
    };
  } 
  
  else {
    // ==========================================
    // 🔴 上級 (難易度3): 複合トラブル (L2 + L3 + ACL)
    // トポロジー: PC -> L3SW -> FW -> Server
    // トラブル: VLANミス + ルーティングミス + ACL遮断
    // ==========================================
    const fwTargetIp = randIp(3);
    const testProtocol = Math.random() > 0.5 ? 'TCP' : 'ICMP';

    return {
      id: `rta-${scenarioId}`,
      difficulty: 3,
      title: `🔴 上級 #${scenarioId}: 厳重なセキュリティ網を突破せよ`,
      description: `複雑な障害が発生しています。L3SWの経路、VLAN、そしてFW(ファイアウォール)のACLを確認し、サーバー(${fwTargetIp})への ${testProtocol} 通信を成功させてください。`,
      nodes: [
        { id: 'pc1', type: 'device', position: { x: 50, y: 150 }, data: { deviceType: 'PC', label: 'Dev-PC', ip: '192.168.10.5', vlan: vlanA, power: 30 } },
        { id: 'l3sw', type: 'device', position: { x: 250, y: 150 }, data: { deviceType: 'L3SW', label: 'Dist-L3SW', ip: '192.168.10.254', vlan: vlanB, power: 80, routingTable: [] } }, // ⚠️ VLAN違い ＆ 経路なし
        { id: 'fw1', type: 'device', position: { x: 450, y: 150 }, data: { 
            deviceType: 'FW', label: 'Edge-FW', ip: '192.168.20.254', power: 45, 
            acl: [{ ip: fwTargetIp, action: 'deny', protocol: 'ANY', port: '' }] // ⚠️ 全面Denyされている
        }},
        { id: 'srv1', type: 'device', position: { x: 650, y: 150 }, data: { deviceType: 'サーバー', label: 'Secure-App', ip: fwTargetIp, vlan: '1', power: 200 } }
      ],
      edges: [
        { id: 'e1', source: 'pc1', target: 'l3sw', type: 'custom', data: { status: 'up' } },
        { id: 'e2', source: 'l3sw', target: 'fw1', type: 'custom', data: { status: 'up' } },
        { id: 'e3', source: 'fw1', target: 'srv1', type: 'custom', data: { status: 'up' } }
      ]
    };
  }
};

// 🌟 指定した問題数分のデータベース(配列)を生成する関数
export const generateThousandScenarios = (count = 1000): RtaScenario[] => {
  const scenarios: RtaScenario[] = [];
  for (let i = 1; i <= count; i++) {
    // 問題を均等に初級・中級・上級に振り分ける
    const difficulty = (Math.floor((i - 1) / (count / 3)) + 1) as 1 | 2 | 3;
    scenarios.push(generateSingleScenario(i, difficulty));
  }
  return scenarios;
};

// 実行時にメモリ上に1000問作成しておく
export const RTA_DATABASE = generateThousandScenarios(1000);

// ランダムに1問引くためのユーティリティ
export const getRandomRta = (difficulty?: 1 | 2 | 3): RtaScenario => {
  const pool = difficulty ? RTA_DATABASE.filter(s => s.difficulty === difficulty) : RTA_DATABASE;
  return pool[Math.floor(Math.random() * pool.length)];
};