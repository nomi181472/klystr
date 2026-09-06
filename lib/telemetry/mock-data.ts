import type { Node, Edge } from '@xyflow/react';

export type TelemetryMetricType = 'throughput' | 'packetRate' | 'activeConnections' | 'tcpRetransmission' | 'tcpRtt';

export interface MetricThresholdMeta {
  label: string;
  unit: string;
  defaultMinThreshold: number;
  defaultMaxThreshold: number;
  defaultThreshold: number;
  min: number;
  max: number;
  step: number;
  description: string;
}

export const METRIC_THRESHOLD_METAS: Record<TelemetryMetricType, MetricThresholdMeta> = {
  throughput: {
    label: 'Throughput',
    unit: 'KB/s',
    defaultMinThreshold: 50, // in KB/s
    defaultMaxThreshold: 500, // in KB/s
    defaultThreshold: 500,
    min: 0,
    max: 10000,
    step: 25,
    description: 'Network traffic volume transferred per second (in KB/s)',
  },
  packetRate: {
    label: 'Packet Rate',
    unit: 'pps',
    defaultMinThreshold: 100,
    defaultMaxThreshold: 1000,
    defaultThreshold: 1000,
    min: 0,
    max: 10000,
    step: 50,
    description: 'Packets transmitted and received per second',
  },
  activeConnections: {
    label: 'Active TCP Connections',
    unit: 'conn',
    defaultMinThreshold: 5,
    defaultMaxThreshold: 50,
    defaultThreshold: 50,
    min: 0,
    max: 500,
    step: 5,
    description: 'Concurrent open TCP connection sockets',
  },
  tcpRetransmission: {
    label: 'TCP Retransmission',
    unit: '%',
    defaultMinThreshold: 1,
    defaultMaxThreshold: 5,
    defaultThreshold: 5,
    min: 0,
    max: 50,
    step: 0.5,
    description: 'Percentage of packets dropped or retransmitted',
  },
  tcpRtt: {
    label: 'TCP RTT',
    unit: 'ms',
    defaultMinThreshold: 100,
    defaultMaxThreshold: 1000, // in ms
    defaultThreshold: 1000,
    min: 0,
    max: 5000,
    step: 25,
    description: 'Round-trip time latency in milliseconds',
  },
};

export interface HeatmapConfig {
  color: string;
  baseColor: string;
  mode: 'threshold' | 'gradient';
  isInverted: boolean; // Invert mode: alert on small/low values (<= min) instead of large/high values (>= max)
  thresholds: Record<TelemetryMetricType, number>;
  minThresholds: Record<TelemetryMetricType, number>;
  maxThresholds: Record<TelemetryMetricType, number>;
}

export const DEFAULT_HEATMAP_COLOR = '#ef4444'; // Red
export const DEFAULT_BASE_COLOR = '#64748b';    // Neutral Slate

export const HEATMAP_COLOR_PRESETS = [
  { label: 'Red Alert', hex: '#ef4444', ring: 'ring-red-500' },
  { label: 'Crimson Flame', hex: '#f43f5e', ring: 'ring-rose-500' },
  { label: 'Orange Warning', hex: '#f97316', ring: 'ring-orange-500' },
  { label: 'Amber Alert', hex: '#f59e0b', ring: 'ring-amber-500' },
  { label: 'Purple Surge', hex: '#8b5cf6', ring: 'ring-purple-500' },
  { label: 'Hot Pink', hex: '#ec4899', ring: 'ring-pink-500' },
  { label: 'Cyan Flow', hex: '#06b6d4', ring: 'ring-cyan-500' },
];

export const DEFAULT_HEATMAP_CONFIG: HeatmapConfig = {
  color: DEFAULT_HEATMAP_COLOR,
  baseColor: DEFAULT_BASE_COLOR,
  mode: 'threshold',
  isInverted: false,
  thresholds: {
    throughput: 500, // in KB/s
    packetRate: 1000,
    activeConnections: 50,
    tcpRetransmission: 5,
    tcpRtt: 1000, // in ms
  },
  minThresholds: {
    throughput: 50, // in KB/s
    packetRate: 100,
    activeConnections: 5,
    tcpRetransmission: 1,
    tcpRtt: 100, // in ms
  },
  maxThresholds: {
    throughput: 500, // in KB/s
    packetRate: 1000,
    activeConnections: 50,
    tcpRetransmission: 5,
    tcpRtt: 1000, // in ms
  },
};


export interface PodNodeData extends Record<string, unknown> {
  label: string;
  namespace: string;
  status: 'Running' | 'Error' | 'Pending';
  workload: string;
  podName?: string;
  isDimmed?: boolean;
  isHighlighted?: boolean;
  onHover?: (id: string | null) => void;
}

export interface WorkloadBoundaryData extends Record<string, unknown> {
  workload: string;
  namespace: string;
  replicaCount: number;
  width: number;
  height: number;
  role: 'source' | 'target' | 'neutral';
  totalThroughput?: number;
}

export interface MetricEdgeData extends Record<string, unknown> {
  sourceId?: string;
  targetId?: string;
  sourceLabel?: string;
  targetLabel?: string;
  lastSeen?: number;
  metrics: {
    throughput: number; // Bytes/sec
    packetRate: number; // Packets/sec
    activeConnections: number;
    tcpRetransmission: number; // %
    tcpRtt: number; // ms
  };
}

export const MOCK_TELEMETRY_NODES: Node<PodNodeData, 'podNode'>[] = [
  // API Gateway Replicas
  { id: 'api-gateway-01', type: 'podNode', position: { x: 100, y: 100 }, data: { label: 'api-gateway-01', namespace: 'default', status: 'Running', workload: 'api-gateway' } },
  { id: 'api-gateway-02', type: 'podNode', position: { x: 100, y: 250 }, data: { label: 'api-gateway-02', namespace: 'default', status: 'Running', workload: 'api-gateway' } },
  { id: 'api-gateway-03', type: 'podNode', position: { x: 100, y: 400 }, data: { label: 'api-gateway-03', namespace: 'default', status: 'Running', workload: 'api-gateway' } },

  // User Service Replicas
  { id: 'user-service-01', type: 'podNode', position: { x: 500, y: 175 }, data: { label: 'user-service-01', namespace: 'default', status: 'Running', workload: 'user-service' } },
  { id: 'user-service-02', type: 'podNode', position: { x: 500, y: 325 }, data: { label: 'user-service-02', namespace: 'default', status: 'Running', workload: 'user-service' } },

  // Database
  { id: 'db-01', type: 'podNode', position: { x: 900, y: 250 }, data: { label: 'postgres-0', namespace: 'database', status: 'Running', workload: 'postgres' } },
];

export const MOCK_TELEMETRY_EDGES: Edge<MetricEdgeData, 'metricEdge'>[] = [
  {
    id: 'e-api1-user1',
    source: 'api-gateway-01',
    target: 'user-service-01',
    type: 'metricEdge',
    data: {
      metrics: {
        throughput: 15400,
        packetRate: 120,
        activeConnections: 45,
        tcpRetransmission: 0.1,
        tcpRtt: 12,
      },
    },
  },
  {
    id: 'e-api2-user1',
    source: 'api-gateway-02',
    target: 'user-service-01',
    type: 'metricEdge',
    data: {
      metrics: {
        throughput: 45000,
        packetRate: 350,
        activeConnections: 120,
        tcpRetransmission: 5.2, // Elevated
        tcpRtt: 45,
      },
    },
  },
  {
    id: 'e-api3-user2',
    source: 'api-gateway-03',
    target: 'user-service-02',
    type: 'metricEdge',
    data: {
      metrics: {
        throughput: 8000,
        packetRate: 60,
        activeConnections: 12,
        tcpRetransmission: 0.0,
        tcpRtt: 5,
      },
    },
  },
  {
    id: 'e-user1-db',
    source: 'user-service-01',
    target: 'db-01',
    type: 'metricEdge',
    data: {
      metrics: {
        throughput: 1250000,
        packetRate: 4500,
        activeConnections: 15,
        tcpRetransmission: 0.5,
        tcpRtt: 2,
      },
    },
  },
  {
    id: 'e-user2-db',
    source: 'user-service-02',
    target: 'db-01',
    type: 'metricEdge',
    data: {
      metrics: {
        throughput: 2500,
        packetRate: 20,
        activeConnections: 2,
        tcpRetransmission: 15.0, // High retransmission
        tcpRtt: 1150, // High latency (>1000ms threshold demo)
      },
    },
  },
];
