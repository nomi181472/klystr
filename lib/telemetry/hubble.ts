import 'server-only';
import * as k8s from '@kubernetes/client-node';

import { createKubeConfig } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────────────────

export type CniType = 'cilium' | 'unknown';

export interface NetworkStackStatus {
  cni: CniType;
  ciliumPod?: string;
  ciliumPhase?: string;
  hubbleReady: boolean;
  hubbleRelayPod?: string;
  isMicrok8s: boolean;
  /** Enable command for microk8s or helm */
  hubbleEnableCommand: string;
  existingNodePort?: number;
}

export interface PodInfo {
  id: string; // namespace/name
  name: string;
  namespace: string;
  ip: string;
}

export interface LiveEdgeData {
  id: string;
  source: string;
  sourceLabel: string;
  sourceNamespace: string;
  target: string;
  targetLabel: string;
  targetNamespace: string;
  lastSeen?: number;
  metrics: {
    throughput: number;        // bytes/s (Rx+Tx)
    packetRate: number;        // packets/s
    activeConnections: number;
    tcpRetransmission: number; // % (RST flag seen / total connections * 100)
    tcpRtt: number;            // ms — 0 means unavailable (requires Hubble)
  };
}

export interface LiveFlowsResult {
  edges: LiveEdgeData[];
  nodes: PodInfo[];
  source: 'cilium-bpf';
  timestamp: number;
}

// ── BPF CT entry ─────────────────────────────────────────────────────────────

interface CtEntry {
  direction: 'IN' | 'OUT';
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  txFlagsSeen: number;  // hex TCP flags
}

// ── Module-level delta snapshot (server singleton) ───────────────────────────

let prevSnapshot: { timestamp: number; entries: Map<string, CtEntry> } | null = null;
let cachedPodMap: { timestamp: number; ipToPod: Map<string, PodInfo> } | null = null;
const POD_MAP_CACHE_TTL_MS = 4_000;

// ── Detection ─────────────────────────────────────────────────────────────────

export async function detectNetworkStack(settings?: Partial<ConnectionSettings>): Promise<NetworkStackStatus> {
  const kc = createKubeConfig(settings);
  const core = kc.makeApiClient(k8s.CoreV1Api);

  const [podsResp, nodesResp, nodePortSvcResp] = await Promise.allSettled([
    core.listNamespacedPod({ namespace: 'kube-system' }),
    core.listNode(),
    core.readNamespacedService({ name: 'hubble-relay-nodeport', namespace: 'kube-system' }),
  ]);

  const pods = podsResp.status === 'fulfilled' ? (podsResp.value.items ?? []) : [];
  const nodes = nodesResp.status === 'fulfilled' ? (nodesResp.value.items ?? []) : [];
  let existingNodePort: number | undefined;

  if (nodePortSvcResp.status === 'fulfilled') {
    existingNodePort = nodePortSvcResp.value.spec?.ports?.find(p => p.name === 'grpc' || p.port === 4245)?.nodePort;
  }

  // Detect Cilium agent (not operator)
  const allCiliumPods = pods.filter(p =>
    (p.metadata?.labels?.['k8s-app'] === 'cilium') &&
    !(p.metadata?.name ?? '').includes('operator')
  );
  
  const ciliumPod = allCiliumPods.find(p => p.status?.phase === 'Running');
  const fallbackCiliumPod = allCiliumPods[0];
  const ciliumPhase = ciliumPod ? 'Running' : fallbackCiliumPod?.status?.phase;

  // Detect microk8s via node labels
  const isMicrok8s = nodes.some(n =>
    Object.keys(n.metadata?.labels ?? {}).some(k => k.includes('microk8s'))
  );

  // Detect Hubble relay
  const hubbleRelayPod = pods.find(p =>
    (p.metadata?.name ?? '').startsWith('hubble-relay') &&
    p.status?.phase === 'Running'
  );

  const hubbleEnableCommand = isMicrok8s
    ? 'Suggestion: run `microk8s cilium hubble enable`'
    : 'Suggestion: run `cilium hubble enable`';

  return {
    cni: (ciliumPod || fallbackCiliumPod) ? 'cilium' : 'unknown',
    ciliumPod: (ciliumPod || fallbackCiliumPod)?.metadata?.name,
    ciliumPhase,
    hubbleReady: Boolean(hubbleRelayPod),
    hubbleRelayPod: hubbleRelayPod?.metadata?.name,
    isMicrok8s,
    hubbleEnableCommand,
    existingNodePort,
  };
}

// ── Main: fetch live flows ────────────────────────────────────────────────────
import {
  aggregatedGrpcFlows,
  GrpcAggregatedEntry,
  isHubbleGrpcStreaming,
  startHubbleGrpcStream,
} from './hubble-grpc';

export async function fetchLiveFlows(
  namespaceFilter?: string | string[],
  settings?: Partial<ConnectionSettings>
): Promise<LiveFlowsResult> {
  const now = Date.now();

  try {
    // 0. Auto-start gRPC stream if not currently streaming and NodePort service exists
    if (!isHubbleGrpcStreaming()) {
      try {
        const kc = createKubeConfig(settings);
        const core = kc.makeApiClient(k8s.CoreV1Api);
        const nodePortSvc = await core.readNamespacedService({ name: 'hubble-relay-nodeport', namespace: 'kube-system' });
        const port = nodePortSvc.spec?.ports?.find(p => p.name === 'grpc' || p.port === 4245)?.nodePort;
        if (port) {
          startHubbleGrpcStream(port, settings).catch(err => {
            console.warn('[Hubble LiveFlows] Auto-starting stream failed:', err);
          });
        }
      } catch {
        // Service might not exist yet
      }
    }

    let ipToPod = new Map<string, PodInfo>();

    // 1. Build IP → pod map (cached for 15s to prevent excessive API server queries)
    if (cachedPodMap && (now - cachedPodMap.timestamp) < POD_MAP_CACHE_TTL_MS) {
      ipToPod = cachedPodMap.ipToPod;
    } else {
      try {
        const kc = createKubeConfig(settings);
        const core = kc.makeApiClient(k8s.CoreV1Api);
        const allPodsResp = await core.listPodForAllNamespaces();
        const allPods = allPodsResp.items ?? [];

        const nextMap = new Map<string, PodInfo>();
        for (const pod of allPods) {
          const ip = pod.status?.podIP;
          const name = pod.metadata?.name;
          const namespace = pod.metadata?.namespace;
          if (ip && name && namespace) {
            nextMap.set(ip, { id: `${namespace}/${name}`, name, namespace, ip });
          }
        }
        ipToPod = nextMap;
        cachedPodMap = { timestamp: now, ipToPod: nextMap };
      } catch (err) {
        console.warn('[Hubble LiveFlows] Failed to refresh pod map from apiserver, using previous cache:', err instanceof Error ? err.message : err);
        ipToPod = cachedPodMap?.ipToPod ?? new Map();
      }
    }

    const currentEntries = new Map<string, GrpcAggregatedEntry>();

    // Read from the active gRPC stream aggregation map
    for (const [key, entry] of aggregatedGrpcFlows.entries()) {
      currentEntries.set(key, { ...entry });
    }

    const deltaSeconds = prevSnapshot ? (now - prevSnapshot.timestamp) / 1000 : null;
    const prevEntries = prevSnapshot?.entries ?? new Map<string, GrpcAggregatedEntry>();
    prevSnapshot = { timestamp: now, entries: currentEntries as unknown as Map<string, CtEntry> };

    // Parse namespace filter
    const allowedNamespaces = Array.isArray(namespaceFilter)
      ? (namespaceFilter.includes('all') ? null : namespaceFilter)
      : (namespaceFilter && namespaceFilter !== 'all' ? [namespaceFilter] : null);

    // 4. Aggregate per pod-pair (orienting client -> server)
    type PairAgg = {
      totalRxBytes: number; totalTxBytes: number;
      totalRxPackets: number; totalTxPackets: number;
      deltaBytes: number; deltaPackets: number;
      connectionCount: number; rstCount: number;
      src: PodInfo; dst: PodInfo;
      lastSeen: number;
    };
    const pairMap = new Map<string, PairAgg>();

    for (const [key, entry] of currentEntries) {
      let src = ipToPod.get(entry.srcIp);
      let dst = ipToPod.get(entry.dstIp);

      // Fallback: use pod names/namespaces directly from Hubble flow metadata
      if (!src && entry.srcPodName && entry.srcNamespace) {
        src = {
          id: `${entry.srcNamespace}/${entry.srcPodName}`,
          name: entry.srcPodName,
          namespace: entry.srcNamespace,
          ip: entry.srcIp,
        };
      }
      if (!dst && entry.dstPodName && entry.dstNamespace) {
        dst = {
          id: `${entry.dstNamespace}/${entry.dstPodName}`,
          name: entry.dstPodName,
          namespace: entry.dstNamespace,
          ip: entry.dstIp,
        };
      }

      if (!src || !dst || src.id === dst.id) continue;

      // Filter by allowed namespaces if specified
      if (allowedNamespaces && allowedNamespaces.length > 0) {
        const matchSrc = allowedNamespaces.includes(src.namespace);
        const matchDst = allowedNamespaces.includes(dst.namespace);
        if (!matchSrc && !matchDst) continue;
      }

      // Orient client -> server (for IN: src is client, for OUT: dst is client)
      const client = entry.direction === 'IN' ? src : dst;
      const server = entry.direction === 'IN' ? dst : src;
      const pairKey = `${client.id}->${server.id}`;

      const prev = prevEntries.get(key);
      const cur = pairMap.get(pairKey) ?? {
        totalRxBytes: 0, totalTxBytes: 0,
        totalRxPackets: 0, totalTxPackets: 0,
        deltaBytes: 0, deltaPackets: 0,
        connectionCount: 0, rstCount: 0,
        src: client, dst: server,
        lastSeen: entry.lastSeen || now,
      };

      cur.totalRxBytes += entry.rxBytes;
      cur.totalTxBytes += entry.txBytes;
      cur.totalRxPackets += entry.rxPackets;
      cur.totalTxPackets += entry.txPackets;
      cur.connectionCount += 1;
      cur.lastSeen = Math.max(cur.lastSeen || 0, entry.lastSeen || now);
      // TCP RST = flag bit 0x04
      if (entry.txFlagsSeen & 0x04) cur.rstCount += 1;

      if (prev && deltaSeconds && deltaSeconds > 0) {
        cur.deltaBytes += Math.max(0, (entry.rxBytes + entry.txBytes) - (prev.rxBytes + prev.txBytes));
        cur.deltaPackets += Math.max(0, (entry.rxPackets + entry.txPackets) - (prev.rxPackets + prev.txPackets));
      }

      pairMap.set(pairKey, cur);
    }

    // 5. Build result
    const podMapById = new Map<string, PodInfo>();
    for (const pod of ipToPod.values()) {
      podMapById.set(pod.id, pod);
    }

    const involvedPodIds = new Set<string>();
    const edges: LiveEdgeData[] = [];

    for (const data of pairMap.values()) {
      const totalBytes = data.totalRxBytes + data.totalTxBytes;

      const throughput = deltaSeconds && deltaSeconds > 0
        ? (data.deltaBytes > 0 ? data.deltaBytes / deltaSeconds : 0)
        : (prevSnapshot ? 0 : totalBytes / 60);

      const totalPackets = data.totalRxPackets + data.totalTxPackets;
      const packetRate = deltaSeconds && deltaSeconds > 0
        ? (data.deltaPackets > 0 ? data.deltaPackets / deltaSeconds : 0)
        : (prevSnapshot ? 0 : totalPackets / 60);

      const retransmissionPct = data.connectionCount > 0
        ? (data.rstCount / data.connectionCount) * 100
        : 0;

      involvedPodIds.add(data.src.id);
      involvedPodIds.add(data.dst.id);
      if (!podMapById.has(data.src.id)) podMapById.set(data.src.id, data.src);
      if (!podMapById.has(data.dst.id)) podMapById.set(data.dst.id, data.dst);

      edges.push({
        id: `${data.src.id}--${data.dst.id}`,
        source: data.src.id,
        sourceLabel: data.src.name,
        sourceNamespace: data.src.namespace,
        target: data.dst.id,
        targetLabel: data.dst.name,
        targetNamespace: data.dst.namespace,
        lastSeen: data.lastSeen || now,
        metrics: {
          throughput: Math.round(throughput),
          packetRate: Math.round(packetRate * 10) / 10,
          activeConnections: data.connectionCount,
          tcpRetransmission: Math.round(retransmissionPct * 10) / 10,
          tcpRtt: 0,
        },
      });
    }

    // Nodes = only pods that appear in at least one edge
    const nodes = Array.from(involvedPodIds)
      .map(id => podMapById.get(id)!)
      .filter(Boolean);

    return { edges, nodes, source: 'cilium-bpf', timestamp: now };
  } catch (err: unknown) {
    console.error('[Hubble LiveFlows] Error processing live flows:', err);
    return { edges: [], nodes: [], source: 'cilium-bpf', timestamp: now };
  }
}
