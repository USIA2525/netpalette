import type { Node, Edge } from '@xyflow/react';

export type SimProtocol = 'ICMP' | 'TCP' | 'UDP';

export type AclRule = {
  ip: string;
  action: 'allow' | 'deny';
  protocol: 'ANY' | SimProtocol;
  port: string;
};

export type RouteRule = {
  dest: string;
  nextHop: string;
};

export type NodeData = {
  label?: string;
  deviceType?: string;
  ip?: string;
  mac?: string;
  vlan?: string;
  power?: number;
  status?: 'up' | 'down';
  customIcon?: string | null;
  routingTable?: RouteRule[];
  acl?: AclRule[];
  isDarkMode?: boolean;
  cidr?: string; // Subnet用
  color?: string; // AreaNode用
  fontSize?: number; // TextNode用
  
  // 🌟 追加: セキュリティ監査用のプロパティ (Sidebar.tsx で使用)
  auditWarning?: string | null;
  
  // 🌟 追加: Live Topology監視用のプロパティ (useLiveMonitoring.ts で使用)
  cpuUsage?: number;
  temperature?: number;
  isAlert?: boolean;

  [key: string]: unknown;
};

export type EdgeData = {
  sourceIf?: string; // 例: Gi0/1
  targetIf?: string; // 例: Gi0/2
  status?: 'up' | 'down';
  speed?: string;    // 例: 1Gbps
  isAnimating?: boolean; // パケットアニメーション用トリガー
  animColor?: string;    // アニメーションの色
  [key: string]: unknown;
};

export type AppNode = Node<NodeData>;
export type AppEdge = Edge<EdgeData>;