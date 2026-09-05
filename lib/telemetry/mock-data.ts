import type { Node, Edge } from '@xyflow/react';

export type TelemetryMetricType = 'throughput' | 'packetRate' | 'activeConnections' | 'tcpRetransmission' | 'tcpRtt';

export interface PodNodeData extends Record<string, unknown> {
  label: string;
  namespace: string;
  status: 'Running' | 'Error' | 'Pending';
  workload: string;
}

export interface MetricEdgeData extends Record<string, unknown> {
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
        tcpRtt: 350, // High latency
      },
    },
  },
];
