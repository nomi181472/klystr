'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NetworkGraphCanvas } from './NetworkGraphCanvas';
import type { Node, Edge } from '@xyflow/react';
import {
  MOCK_TELEMETRY_NODES,
  MOCK_TELEMETRY_EDGES,
  type TelemetryMetricType,
  type PodNodeData,
  type WorkloadBoundaryData,
  type MetricEdgeData,
  type HeatmapConfig,
  DEFAULT_HEATMAP_CONFIG,
} from '@/lib/telemetry/mock-data';
import { Check, ChevronDown, RotateCcw, Play, Pause, RefreshCw, LayoutGrid, Box, Timer } from 'lucide-react';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { useConnectionStore } from '@/stores/connection-store';
import { cn } from '@/lib/utils';
import { InactivityToastStack, type InactivityNotice } from './InactivityToast';

export type AggregationMethod = 'instantaneous' | 'sum' | 'average' | 'max';
export type PollingIntervalOption = '2s' | '5s' | '10s' | '30s' | 'manual';
export type PodAgeOption = '10s' | '1m' | '2m' | '3m' | 'off';

export const POD_AGE_MAP: Record<PodAgeOption, number | null> = {
  '10s': 10 * 1000,
  '1m': 60 * 1000,
  '2m': 120 * 1000,
  '3m': 180 * 1000,
  'off': null,
};

export const POD_AGE_LABELS: Record<PodAgeOption, string> = {
  '10s': '10 seconds',
  '1m': '1 minute',
  '2m': '2 minutes',
  '3m': '3 minutes',
  'off': 'No Expiry',
};

const INTERVAL_MAP: Record<PollingIntervalOption, number | null> = {
  '2s': 2000,
  '5s': 5000,
  '10s': 10000,
  '30s': 30000,
  'manual': null,
};

export interface EdgeMetricsState {
  latest: number;
  sum: number;
  count: number;
  max: number;
  history: number[];
}

function getWorkloadBaseTier(name: string): number {
  const n = name.toLowerCase();
  // Tier 0: Traffic generators / Clients / External callers / Senders
  if (/(generator|client|load|curl|sender|producer|locust|traffic-debug|traffic)/i.test(n)) return 0;
  // Tier 1: Frontends / Web / UI / NGINX entry
  if (/(frontend|ui|web|portal|nginx)/i.test(n)) return 1;
  // Tier 2: API Gateways / Reverse proxies / Ingress controllers
  if (/(gateway|proxy|router|envoy|traefik|ingress)/i.test(n)) return 2;
  // Tier 3: Business APIs / Microservices (api1, api2, backend)
  if (/(api1|api2|api|service|app|backend|auth|order|payment)/i.test(n)) return 3;
  // Tier 4: Master cache / Master DB / Primary Datastores
  if (/(redis-master|memcached|cache|queue|kafka|rabbitmq|master|db|database|postgres|mysql)/i.test(n)) return 4;
  // Tier 5: Replica Datastores / Secondary Read-Replicas / Sinks
  if (/(replica|slave|consumer|sink)/i.test(n)) return 5;
  return 3;
}

function layoutPodNodes(
  pods: { id: string; label: string; namespace: string; status?: string }[],
  savedPositions: Map<string, { x: number; y: number }>,
  knownEdges: Edge<MetricEdgeData, 'metricEdge'>[] = []
): Node<PodNodeData | WorkloadBoundaryData>[] {
  const byNs = new Map<string, typeof pods>();
  for (const pod of pods) {
    const list = byNs.get(pod.namespace) || [];
    list.push(pod);
    byNs.set(pod.namespace, list);
  }

  const result: Node<PodNodeData | WorkloadBoundaryData>[] = [];
  let globalColOffset = 0;
  const START_X = 80;
  const START_Y = 80;
  const COL_WIDTH = 290;
  const COL_GAP = 300;

  for (const [ns, nsPods] of byNs) {
    // 1. Group pods by workload deployment
    const workloads = new Map<string, typeof pods>();
    const podMap = new Map<string, typeof pods[0]>();

    for (const pod of nsPods) {
      const wl = pod.label || 'unknown';
      const list = workloads.get(wl) || [];
      list.push(pod);
      workloads.set(wl, list);

      podMap.set(pod.id, pod);
      const shortName = pod.id.includes('/') ? pod.id.split('/')[1] : pod.id;
      podMap.set(shortName, pod);
    }

    const allWlNames = Array.from(workloads.keys());

    // 2. Build acyclic directed caller -> callee graph based on active network edges and base tiers
    const callGraph = new Map<string, Set<string>>();
    const inCallers = new Map<string, Set<string>>();

    for (const wl of allWlNames) {
      callGraph.set(wl, new Set());
      inCallers.set(wl, new Set());
    }

    for (const edge of knownEdges) {
      const srcPod = podMap.get(edge.source) || podMap.get(edge.source.split('/').pop() || '');
      const dstPod = podMap.get(edge.target) || podMap.get(edge.target.split('/').pop() || '');

      if (srcPod?.label && dstPod?.label && srcPod.label !== dstPod.label) {
        if (workloads.has(srcPod.label) && workloads.has(dstPod.label)) {
          const wlA = srcPod.label;
          const wlB = dstPod.label;
          const tierA = getWorkloadBaseTier(wlA);
          const tierB = getWorkloadBaseTier(wlB);

          // Decide canonical caller -> callee direction to ensure strict Left-to-Right request flow
          let caller = wlA;
          let callee = wlB;

          if (tierA < tierB) {
            caller = wlA;
            callee = wlB;
          } else if (tierA > tierB) {
            // Reverse edge indicates return traffic/ACK from callee to caller; request origin is wlB
            caller = wlB;
            callee = wlA;
          } else {
            // Same tier: prevent cycles
            if (callGraph.get(wlB)?.has(wlA)) {
              continue;
            }
          }

          callGraph.get(caller)!.add(callee);
          inCallers.get(callee)!.add(caller);
        }
      }
    }

    // 3. Assign topological layers:
    // Workloads start at their base tier
    const layers = new Map<string, number>();
    for (const wl of allWlNames) {
      layers.set(wl, getWorkloadBaseTier(wl));
    }

    // Topological DAG relaxation (at most allWlNames.length iterations)
    // Caller is always placed to the left of callee: layer[callee] >= layer[caller] + 1
    for (let iter = 0; iter < allWlNames.length; iter++) {
      let changed = false;
      for (const [caller, callees] of callGraph) {
        const callerLayer = layers.get(caller) ?? 0;
        for (const callee of callees) {
          const calleeLayer = layers.get(callee) ?? 0;
          if (calleeLayer <= callerLayer) {
            layers.set(callee, callerLayer + 1);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    // 4. Group workloads by Layer (Column)
    const layerMap = new Map<number, string[]>();
    for (const [wl, l] of layers) {
      const list = layerMap.get(l) || [];
      list.push(wl);
      layerMap.set(l, list);
    }

    // Sort layer numbers ascending (Left to Right)
    const sortedLayerIndices = Array.from(layerMap.keys()).sort((a, b) => a - b);

    // 5. Layout each layer:
    // - Each layer forms 1 Column at X = START_X + colIdx * (COL_WIDTH + COL_GAP)
    // - Workloads at the same level form multiple Row boundaries stacked vertically in that 1 column
    // - Inside each boundary, replica pods are in 1 single column stacked in rows
    sortedLayerIndices.forEach((layerIdx, localColIdx) => {
      const currentX = START_X + (globalColOffset + localColIdx) * (COL_WIDTH + COL_GAP);
      let currentY = START_Y;

      const layerWorkloads = layerMap.get(layerIdx) || [];
      layerWorkloads.sort(); // deterministic ordering for same-level workloads

      for (const wlName of layerWorkloads) {
        const wlPods = workloads.get(wlName) || [];
        const replicaCount = wlPods.length;
        const cardHeight = 48;
        const rowGap = 12;

        const boundaryWidth = COL_WIDTH;
        const boundaryHeight = 52 + replicaCount * (cardHeight + rowGap) + 12;

        const boundaryPos = {
          x: currentX,
          y: currentY,
        };
        savedPositions.set(`boundary-${ns}-${wlName}`, boundaryPos);

        const role = (inCallers.get(wlName)?.size ?? 0) === 0
          ? 'source'
          : (callGraph.get(wlName)?.size ?? 0) === 0
            ? 'target'
            : 'neutral';

        // Add boundary container node
        result.push({
          id: `boundary-${ns}-${wlName}`,
          type: 'workloadBoundary',
          position: boundaryPos,
          width: boundaryWidth,
          height: boundaryHeight,
          style: { width: boundaryWidth, height: boundaryHeight },
          data: {
            workload: wlName,
            namespace: ns,
            replicaCount,
            width: boundaryWidth,
            height: boundaryHeight,
            role,
          },
          draggable: false,
          selectable: false,
          zIndex: -1,
        });

        // Place replica pods in 1 column inside boundary, stacked in rows
        for (let r = 0; r < wlPods.length; r++) {
          const pod = wlPods[r];
          const pos = {
            x: boundaryPos.x + 20,
            y: boundaryPos.y + 50 + r * (cardHeight + rowGap),
          };
          savedPositions.set(pod.id, pos);

          const podShortName = pod.id.includes('/') ? pod.id.split('/')[1] : pod.id;

          result.push({
            id: pod.id,
            type: 'podNode',
            position: pos,
            width: 250,
            height: 48,
            style: { width: 250, height: 48 },
            data: {
              id: pod.id,
              label: pod.label,
              namespace: pod.namespace,
              status: (pod.status as 'Running' | 'Error' | 'Pending') || 'Running',
              workload: pod.label,
              podName: podShortName,
            },
          });
        }

        // Multiple boundaries at the same level stack vertically in rows with generous spacing
        currentY += boundaryHeight + 36;
      }
    });

    globalColOffset += sortedLayerIndices.length;
  }

  return result;
}

export function LiveNetworkingView() {
  const { mode, ...settings } = useConnectionStore(s => s.settings);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const rawPodsRef = useRef<{ id: string; label: string; namespace: string; status?: string }[]>([]);
  const [resetKey, setResetKey] = useState(0);

  // Live polling controls & disposal
  const [isStreaming, setIsStreaming] = useState(true);
  const [pollingInterval, setPollingInterval] = useState<PollingIntervalOption>('2s');
  const [isRefreshingFlows, setIsRefreshingFlows] = useState(false);
  const [manualTriggerCount, setManualTriggerCount] = useState(0);

  const [selectedMetric, setSelectedMetric] = useState<TelemetryMetricType>('throughput');
  const [aggregator, setAggregator] = useState<AggregationMethod>('instantaneous');
  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig>(DEFAULT_HEATMAP_CONFIG);

  // Pod Age / Inactivity Window & Notifications
  const [podAge, setPodAge] = useState<PodAgeOption>('1m');
  const podAgeRef = useRef<PodAgeOption>(podAge);
  useEffect(() => {
    podAgeRef.current = podAge;
  }, [podAge]);

  const [inactivityNotices, setInactivityNotices] = useState<InactivityNotice[]>([]);
  const dismissNotice = useCallback((id: string) => {
    setInactivityNotices(prev => prev.filter(n => n.id !== id));
  }, [setInactivityNotices]);

  const handlePodAgeChange = useCallback((newAge: PodAgeOption) => {
    setPodAge(newAge);
    podAgeRef.current = newAge;
    if (newAge === 'off') {
      setInactivityNotices([]);
      prevVisiblePodIdsRef.current.clear();
    }
  }, [setInactivityNotices]);

  // Activity tracking state (reactive, pure during render)
  const [podLastSeen, setPodLastSeen] = useState<Record<string, number>>({});
  const [edgeLastSeen, setEdgeLastSeen] = useState<Record<string, number>>({});
  const [lastTickTime, setLastTickTime] = useState<number>(0);

  // Background mutation stores for interval tick
  const podActivityStore = useRef<Record<string, number>>({});
  const edgeActivityStore = useRef<Record<string, number>>({});
  const prevVisiblePodIdsRef = useRef<Set<string>>(new Set());
  const tickCountRef = useRef(0);
  
  // Namespaces (Multi-select)
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set(['default']));
  const [isNsDropdownOpen, setIsNsDropdownOpen] = useState(false);
  
  // Pods & Workload Boundaries
  const [availablePods, setAvailablePods] = useState<Node<PodNodeData | WorkloadBoundaryData>[]>([]);
  const [selectedPods, setSelectedPods] = useState<Set<string>>(new Set());
  const [isPodDropdownOpen, setIsPodDropdownOpen] = useState(false);

  // Live Flows
  const [liveEdges, setLiveEdges] = useState<Edge<MetricEdgeData, 'metricEdge'>[]>([]);
  const [edgeStates, setEdgeStates] = useState<Record<string, EdgeMetricsState>>({});
  
  const [loading, setLoading] = useState(true);
  const versionRef = useRef(`${selectedMetric}:${aggregator}`);

  const settingsStr = JSON.stringify(settings);
  const namespacesStr = Array.from(selectedNamespaces).sort().join(',');

  // Fetch Namespaces with reload capability
  const [isNsLoading, setIsNsLoading] = useState(false);
  const [nsRefreshKey, setNsRefreshKey] = useState(0);

  // Fetch Pods with reload capability
  const [podsRefreshKey, setPodsRefreshKey] = useState(0);

  // When namespace reload is clicked:
  // Re-fetches namespaces AND cascades to reload pods, reset pod selections, and refresh flows
  const reloadNamespaces = () => {
    setNsRefreshKey(k => k + 1);
    setSelectedPods(new Set());
    setPodsRefreshKey(k => k + 1);
    setManualTriggerCount(c => c + 1);
  };

  // When pod reload is clicked:
  // Re-fetches only pods and flows WITHOUT refreshing namespaces
  const reloadPods = () => {
    setPodsRefreshKey(k => k + 1);
    setManualTriggerCount(c => c + 1);
  };

  useEffect(() => {
    const handleRefresh = () => {
      reloadNamespaces();
    };
    window.addEventListener('klystr:refresh:telemetry', handleRefresh);
    return () => window.removeEventListener('klystr:refresh:telemetry', handleRefresh);
  }, []);

  useEffect(() => {
    let active = true;
    if (mode === 'mock') {
      Promise.resolve().then(() => {
        if (active) setNamespaces(Array.from(new Set(MOCK_TELEMETRY_NODES.map(n => n.data.namespace))));
      });
      return;
    }
    Promise.resolve().then(() => {
      if (active) setIsNsLoading(true);
    });
    fetch('/api/topology/namespaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...settings })
    })
      .then(r => r.json())
      .then(d => {
        if (active && d.namespaces) {
          setNamespaces(d.namespaces);
          setSelectedNamespaces(prev => {
            if (prev.has('all')) return prev;
            const valid = new Set(Array.from(prev).filter(ns => d.namespaces.includes(ns)));
            return valid.size > 0 ? valid : new Set(['default']);
          });
        }
      })
      .catch(console.error)
      .finally(() => {
        if (active) setIsNsLoading(false);
      });

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, settingsStr, nsRefreshKey]);

  useEffect(() => {
    let active = true;

    if (mode === 'mock') {
      const isAll = selectedNamespaces.has('all') || selectedNamespaces.size === 0;
      Promise.resolve().then(() => {
        if (active) {
          const rawMockPods = MOCK_TELEMETRY_NODES
            .filter(n => isAll || selectedNamespaces.has(n.data.namespace))
            .map(n => ({
              id: n.id,
              label: n.data.workload,
              namespace: n.data.namespace,
              status: n.data.status,
            }));
          rawPodsRef.current = rawMockPods;
          setAvailablePods(layoutPodNodes(rawMockPods, positionsRef.current, MOCK_TELEMETRY_EDGES));
          setLoading(false);
        }
      });
      return;
    }

    Promise.resolve().then(() => {
      positionsRef.current.clear();
      if (active) setLoading(true);
    });
    const nsArray = selectedNamespaces.has('all') || selectedNamespaces.size === 0 ? ['all'] : Array.from(selectedNamespaces);
    
    // Safety timeout to prevent perpetual "Loading..." state under any network failure
    const safetyTimeout = setTimeout(() => {
      if (active) setLoading(false);
    }, 6000);

    fetch('/api/telemetry/pods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { mode, ...settings }, namespaces: nsArray })
    })
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        if (d.pods && Array.isArray(d.pods)) {
          rawPodsRef.current = d.pods;
          setAvailablePods(layoutPodNodes(d.pods, positionsRef.current, liveEdges));
        } else {
          rawPodsRef.current = [];
          setAvailablePods([]);
        }
      })
      .catch((err) => {
        console.error('[LiveNetworkingView] Error fetching pods:', err);
        if (active) setAvailablePods([]);
      })
      .finally(() => {
        clearTimeout(safetyTimeout);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(safetyTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespacesStr, mode, settingsStr, podsRefreshKey]);

  // Simulation / Live Flow Fetching Loop with Clean Disposal & Garbage Collection
  useEffect(() => {
    versionRef.current = `${selectedMetric}:${aggregator}`;
    let timeoutId: NodeJS.Timeout | undefined;
    let active = true;
    let abortController: AbortController | null = null;

    const intervalMs = INTERVAL_MAP[pollingInterval];

    const tick = async () => {
      if (!active) return;
      const version = `${selectedMetric}:${aggregator}`;
      setIsRefreshingFlows(true);
      
      let newEdges: Edge<MetricEdgeData, 'metricEdge'>[] = [];
      
      if (mode === 'live') {
        try {
          abortController = new AbortController();
          const nsArray = selectedNamespaces.has('all') || selectedNamespaces.size === 0 ? ['all'] : Array.from(selectedNamespaces);
          const res = await fetch('/api/telemetry/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              settings: { mode, ...settings }, 
              namespaceFilter: nsArray.includes('all') ? undefined : nsArray
            }),
            signal: abortController.signal
          });
          if (res.ok) {
            const d = await res.json();
            if (d.edges && Array.isArray(d.edges)) {
              newEdges = d.edges.map((e: { id: string; source: string; target: string; sourceLabel?: string; targetLabel?: string; lastSeen?: number; metrics?: Record<string, number> }) => ({
                id: e.id,
                type: 'metricEdge',
                source: e.source,
                target: e.target,
                data: {
                  sourceId: e.source,
                  targetId: e.target,
                  sourceLabel: e.sourceLabel || e.source,
                  targetLabel: e.targetLabel || e.target,
                  lastSeen: e.lastSeen,
                  metrics: {
                    throughput: e.metrics?.throughput ?? 0,
                    packetRate: e.metrics?.packetRate ?? 0,
                    activeConnections: e.metrics?.activeConnections ?? 0,
                    tcpRetransmission: e.metrics?.tcpRetransmission ?? 0,
                    tcpRtt: e.metrics?.tcpRtt ?? 0,
                  }
                }
              }));
            }
          }
          if (active) {
            setLiveEdges(newEdges);
            if (rawPodsRef.current.length > 0) {
              setAvailablePods(layoutPodNodes(rawPodsRef.current, positionsRef.current, newEdges));
            }
          }

          // Periodic sync with cluster pods (every ~10s in live mode)
          tickCountRef.current += 1;
          if (mode === 'live' && tickCountRef.current % 5 === 0) {
            fetch('/api/telemetry/pods', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ settings: { mode, ...settings }, namespaces: nsArray })
            })
              .then(r => r.json())
              .then(d => {
                if (active && d.pods && Array.isArray(d.pods)) {
                  rawPodsRef.current = d.pods;
                  setAvailablePods(layoutPodNodes(d.pods, positionsRef.current, newEdges));
                }
              })
              .catch(() => {});
          }
        } catch (e: unknown) {
          if ((e as Error)?.name !== 'AbortError') {
            console.error('[LiveNetworkingView] Flows fetch error:', e);
          }
        } finally {
          if (active) setIsRefreshingFlows(false);
        }
      } else {
        newEdges = MOCK_TELEMETRY_EDGES;
        setIsRefreshingFlows(false);
      }

      if (!active) return;

      const activeEdges = mode === 'live' ? newEdges : MOCK_TELEMETRY_EDGES;
      const activeEdgeIdSet = new Set(activeEdges.map(e => e.id));

      const now = Date.now();
      const currentPodStore = { ...podActivityStore.current };
      const currentEdgeStore = { ...edgeActivityStore.current };

      // Prune deleted K8s pods from activity store
      if (rawPodsRef.current.length > 0) {
        const currentK8sPodIdSet = new Set(rawPodsRef.current.map(p => p.id));
        for (const recordedId of Object.keys(currentPodStore)) {
          if (!currentK8sPodIdSet.has(recordedId)) {
            delete currentPodStore[recordedId];
            delete podActivityStore.current[recordedId];
            prevVisiblePodIdsRef.current.delete(recordedId);
          }
        }
      }

      // Register newly discovered pods with initial activity timestamp (grace period of N)
      rawPodsRef.current.forEach(p => {
        if (!currentPodStore[p.id]) {
          currentPodStore[p.id] = now;
        }
      });

      // Update traffic activity: whenever a packet arrives on an edge,
      // update the edge's lastSeen and reset both source and destination pods' activity
      activeEdges.forEach((edge: Edge<MetricEdgeData, 'metricEdge'>) => {
        const m = edge.data?.metrics;
        const hasTraffic = mode === 'mock'
          ? true
          : ((m?.packetRate ?? 0) > 0 || (m?.throughput ?? 0) > 0);

        const rawLastSeen = typeof edge.data?.lastSeen === 'number' ? edge.data.lastSeen : undefined;
        const activityTime = hasTraffic ? (rawLastSeen || now) : rawLastSeen;

        if (activityTime) {
          currentEdgeStore[edge.id] = Math.max(currentEdgeStore[edge.id] || 0, activityTime);
          // "if any pod src and destination packet come it should not remove untill remaining n seconds."
          currentPodStore[edge.source] = Math.max(currentPodStore[edge.source] || 0, activityTime);
          currentPodStore[edge.target] = Math.max(currentPodStore[edge.target] || 0, activityTime);
        }
      });

      podActivityStore.current = currentPodStore;
      edgeActivityStore.current = currentEdgeStore;

      // Always read the live podAge from ref so closures never get stale
      const currentPodAge = podAgeRef.current;
      const maxAgeMs = POD_AGE_MAP[currentPodAge];

      if (maxAgeMs === null) {
        // "Off (Keep all)" is selected: clear any notices and NEVER expire any node!
        setInactivityNotices([]);
        prevVisiblePodIdsRef.current.clear();
      } else {
        // Detect disappearing nodes due to no traffic
        if (prevVisiblePodIdsRef.current.size > 0) {
          const newlyDisappeared: InactivityNotice[] = [];
          for (const prevId of prevVisiblePodIdsRef.current) {
            const lastActive = currentPodStore[prevId];
            if (lastActive && (now - lastActive) > maxAgeMs) {
              const shortName = prevId.includes('/') ? prevId.split('/')[1] : prevId;
              newlyDisappeared.push({
                id: `${prevId}-${now}`,
                podName: shortName,
                namespace: prevId.includes('/') ? prevId.split('/')[0] : undefined,
                ageLabel: POD_AGE_LABELS[currentPodAge],
                timestamp: now,
              });
              prevVisiblePodIdsRef.current.delete(prevId);
            }
          }
          if (newlyDisappeared.length > 0) {
            setInactivityNotices(prev => [...prev, ...newlyDisappeared].slice(-5));
          }
        }

        // Record current active pods for next comparison
        const alivePodIds = new Set(
          Object.entries(currentPodStore)
            .filter(([, lastTime]) => (now - lastTime) <= maxAgeMs)
            .map(([id]) => id)
        );
        prevVisiblePodIdsRef.current = alivePodIds;
      }

      setPodLastSeen(currentPodStore);
      setEdgeLastSeen(currentEdgeStore);
      setLastTickTime(now);

      setEdgeStates(prev => {
        const shouldReset = versionRef.current !== version;
        if (shouldReset) versionRef.current = version;
        
        // Garbage collection: prune states for dead/terminated edges
        const nextState: Record<string, EdgeMetricsState> = {};
        if (!shouldReset) {
          for (const [id, st] of Object.entries(prev)) {
            if (activeEdgeIdSet.has(id)) {
              nextState[id] = st;
            }
          }
        }
        
        activeEdges.forEach((edge: Edge<MetricEdgeData, 'metricEdge'>) => {
          const baseValue = edge.data?.metrics?.[selectedMetric as keyof MetricEdgeData['metrics']] ?? 0;
          let packetValue = baseValue;
          
          if (mode === 'mock') {
            const jitter = baseValue * 0.3 * (Math.random() * 2 - 1);
            packetValue = Math.max(0, baseValue + jitter);
            if (selectedMetric === 'activeConnections' || selectedMetric === 'packetRate') {
              packetValue = Math.round(packetValue);
            }
          }
          
          const current = nextState[edge.id] ?? { latest: 0, sum: 0, count: 0, max: 0, history: [] };
          nextState[edge.id] = {
            latest: packetValue,
            sum: current.sum + packetValue,
            count: current.count + 1,
            max: Math.max(current.max, packetValue),
            // Strictly cap history buffer at 10 items to prevent memory growth
            history: [...current.history, packetValue].slice(-10),
          };
        });
        return nextState;
      });

      // Only schedule next tick if live streaming is active and interval is not manual
      if (active && isStreaming && intervalMs !== null) {
        timeoutId = setTimeout(tick, intervalMs);
      }
    };

    tick();
    
    // Dispose: immediately abort in-flight requests and cancel timers
    return () => {
      active = false;
      if (abortController) {
        abortController.abort();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetric, aggregator, mode, namespacesStr, settingsStr, isStreaming, pollingInterval, manualTriggerCount]);

  const toggleNs = (ns: string) => {
    const next = new Set(selectedNamespaces);
    if (ns === 'all') {
      next.clear();
      next.add('all');
    } else {
      next.delete('all');
      if (next.has(ns)) next.delete(ns);
      else next.add(ns);
      if (next.size === 0) next.add('all');
    }
    setSelectedNamespaces(next);
    setSelectedPods(new Set()); // reset pods when ns changes
  };

  const togglePod = (podId: string) => {
    const next = new Set(selectedPods);
    if (next.has(podId)) next.delete(podId);
    else next.add(podId);
    setSelectedPods(next);
  };

  const groupedPods = React.useMemo(() => {
    const groups: Record<string, Node<PodNodeData, 'podNode'>[]> = {};
    availablePods
      .filter((n): n is Node<PodNodeData, 'podNode'> => n.type === 'podNode')
      .forEach(pod => {
        const ns = pod.data.namespace;
        if (!groups[ns]) groups[ns] = [];
        groups[ns].push(pod);
      });
    return groups;
  }, [availablePods]);

  const filteredNodes = React.useMemo(() => {
    const maxAgeMs = POD_AGE_MAP[podAge];

    const podNodes = availablePods.filter((n): n is Node<PodNodeData, 'podNode'> => n.type === 'podNode');
    const selectedPodNodes = selectedPods.size === 0
      ? podNodes
      : podNodes.filter(n => selectedPods.has(n.id));

    // When podAge is 'off' (Keep all), keep ALL pods and boundaries without any age filtering!
    if (maxAgeMs === null) {
      const activeWorkloadSet = new Set(selectedPodNodes.map(n => `${n.data.namespace}/${n.data.workload}`));
      const boundaryNodes = availablePods.filter(n => {
        if (n.type !== 'workloadBoundary') return false;
        const bData = n.data as unknown as WorkloadBoundaryData;
        return activeWorkloadSet.has(`${bData.namespace}/${bData.workload}`);
      });
      return [...boundaryNodes, ...selectedPodNodes];
    }

    // Render-time inactivity check: check last edge date if < n then hide else show
    const activePodNodes = lastTickTime === 0
      ? selectedPodNodes
      : selectedPodNodes.filter(pod => {
          const lastActive = podLastSeen[pod.id];
          if (!lastActive) return true;
          return (lastTickTime - lastActive) <= maxAgeMs;
        });

    const activeWorkloadSet = new Set(activePodNodes.map(n => `${n.data.namespace}/${n.data.workload}`));

    const boundaryNodes = availablePods
      .filter((n): n is Node<WorkloadBoundaryData, 'workloadBoundary'> => n.type === 'workloadBoundary')
      .filter(n => activeWorkloadSet.has(`${n.data.namespace}/${n.data.workload}`))
      .map(n => {
        const activeCount = activePodNodes.filter(
          p => p.data.namespace === n.data.namespace && p.data.workload === n.data.workload
        ).length;
        const cardHeight = 48;
        const rowGap = 12;
        const boundaryHeight = 52 + activeCount * (cardHeight + rowGap) + 12;

        return {
          ...n,
          height: boundaryHeight,
          style: { ...n.style, height: boundaryHeight },
          data: {
            ...n.data,
            replicaCount: activeCount,
            height: boundaryHeight,
          },
        };
      });

    // Re-stack active pods neatly inside their adjusted workload boundaries
    const positionedPods = activePodNodes.map(pod => {
      const boundary = boundaryNodes.find(
        b => b.data.namespace === pod.data.namespace && b.data.workload === pod.data.workload
      );
      if (!boundary) return pod;

      const siblings = activePodNodes.filter(
        p => p.data.namespace === pod.data.namespace && p.data.workload === pod.data.workload
      );
      const r = siblings.findIndex(p => p.id === pod.id);
      if (r === -1) return pod;

      const cardHeight = 48;
      const rowGap = 12;
      const pos = {
        x: boundary.position.x + 20,
        y: boundary.position.y + 50 + r * (cardHeight + rowGap),
      };
      return {
        ...pod,
        position: pos,
      };
    });

    return [...boundaryNodes, ...positionedPods];
  }, [availablePods, selectedPods, podAge, podLastSeen, lastTickTime]);

  const filteredNodeIds = React.useMemo(
    () => new Set(filteredNodes.filter(n => n.type === 'podNode').map(n => n.id)),
    [filteredNodes]
  );

  const [viewMode, setViewMode] = useState<'pods' | 'workloads'>('pods');

  const filteredEdges = React.useMemo(() => {
    const edges = mode === 'mock' ? MOCK_TELEMETRY_EDGES : liveEdges;
    const maxAgeMs = POD_AGE_MAP[podAge];

    // When podAge is 'off' (Keep all), return all edges between visible nodes!
    if (maxAgeMs === null) {
      return edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));
    }

    return edges.filter(e => {
      if (!filteredNodeIds.has(e.source) || !filteredNodeIds.has(e.target)) {
        return false;
      }
      if (lastTickTime > 0) {
        const edgeLastActive = edgeLastSeen[e.id];
        if (edgeLastActive && (lastTickTime - edgeLastActive) > maxAgeMs) {
          return false;
        }
      }
      return true;
    });
  }, [filteredNodeIds, mode, liveEdges, podAge, edgeLastSeen, lastTickTime]);

  // Reset tracked visible pods when namespace or manual filter changes
  useEffect(() => {
    prevVisiblePodIdsRef.current.clear();
  }, [namespacesStr, selectedPods]);

  // Support high-level Workload summary aggregation vs detailed Pod replica mesh
  const displayedEdges = React.useMemo(() => {
    if (viewMode === 'pods') {
      return filteredEdges;
    }

    const workloadEdgeMap = new Map<string, {
      id: string;
      source: string;
      target: string;
      metrics: {
        throughput: number;
        packetRate: number;
        activeConnections: number;
        tcpRetransmission: number;
        tcpRtt: number;
      };
      count: number;
    }>();

    const podToWorkloadBoundary = new Map<string, string>();
    for (const node of filteredNodes) {
      if (node.type === 'podNode') {
        const pData = node.data as unknown as PodNodeData;
        podToWorkloadBoundary.set(node.id, `boundary-${pData.namespace}-${pData.workload}`);
      }
    }

    for (const edge of filteredEdges) {
      const srcBoundary = podToWorkloadBoundary.get(edge.source);
      const dstBoundary = podToWorkloadBoundary.get(edge.target);
      if (!srcBoundary || !dstBoundary || srcBoundary === dstBoundary) continue;

      const key = `${srcBoundary}->${dstBoundary}`;
      const existing = workloadEdgeMap.get(key) || {
        id: `wl-edge-${key}`,
        source: srcBoundary,
        target: dstBoundary,
        metrics: {
          throughput: 0,
          packetRate: 0,
          activeConnections: 0,
          tcpRetransmission: 0,
          tcpRtt: 0,
        },
        count: 0,
      };

      const m = edge.data?.metrics;
      if (m) {
        existing.metrics.throughput += m.throughput || 0;
        existing.metrics.packetRate += m.packetRate || 0;
        existing.metrics.activeConnections += m.activeConnections || 0;
        existing.metrics.tcpRetransmission += m.tcpRetransmission || 0;
        existing.metrics.tcpRtt += m.tcpRtt || 0;
        existing.count += 1;
      }

      workloadEdgeMap.set(key, existing);
    }

    return Array.from(workloadEdgeMap.values()).map(we => ({
      id: we.id,
      type: 'metricEdge' as const,
      source: we.source,
      target: we.target,
      data: {
        sourceId: we.source,
        targetId: we.target,
        sourceLabel: we.source.replace(/^boundary-[^-]+-/, ''),
        targetLabel: we.target.replace(/^boundary-[^-]+-/, ''),
        metrics: {
          throughput: we.metrics.throughput,
          packetRate: we.metrics.packetRate,
          activeConnections: we.metrics.activeConnections,
          tcpRetransmission: we.count > 0 ? Math.round((we.metrics.tcpRetransmission / we.count) * 10) / 10 : 0,
          tcpRtt: we.count > 0 ? Math.round(we.metrics.tcpRtt / we.count) : 0,
        },
      },
    }));
  }, [viewMode, filteredEdges, filteredNodes]);

  const resetLayout = () => {
    positionsRef.current.clear();
    if (rawPodsRef.current.length > 0) {
      setAvailablePods(layoutPodNodes(rawPodsRef.current, positionsRef.current, liveEdges));
    } else if (mode === 'mock') {
      const isAll = selectedNamespaces.has('all') || selectedNamespaces.size === 0;
      const rawMockPods = MOCK_TELEMETRY_NODES
        .filter(n => isAll || selectedNamespaces.has(n.data.namespace))
        .map(n => ({
          id: n.id,
          label: n.data.workload,
          namespace: n.data.namespace,
          status: n.data.status,
        }));
      setAvailablePods(layoutPodNodes(rawMockPods, positionsRef.current, MOCK_TELEMETRY_EDGES));
    }
    setResetKey(k => k + 1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filters toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        
        {/* Namespace multi-select */}
        <div className="relative flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Namespace</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsNsDropdownOpen(o => !o)}
              className="flex min-w-[130px] items-center justify-between gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm outline-none focus:border-primary"
            >
              <span className="truncate">
                {selectedNamespaces.has('all') ? 'All Namespaces' : `${selectedNamespaces.size} selected`}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); reloadNamespaces(); }}
              title="Reload namespaces"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", isNsLoading && "animate-spin text-primary")} />
            </button>
          </div>
          {isNsDropdownOpen && (
            <div className="absolute top-full left-14 z-50 mt-1 max-h-64 w-60 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Namespaces</span>
                <button
                  onClick={(e) => { e.stopPropagation(); reloadNamespaces(); }}
                  title="Reload namespaces"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className={cn("h-2.5 w-2.5", isNsLoading && "animate-spin text-primary")} />
                  <span>Reload</span>
                </button>
              </div>
              <div className="my-1 h-px bg-border" />
              <div
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                onClick={() => toggleNs('all')}
              >
                <div className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${selectedNamespaces.has('all') ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                  {selectedNamespaces.has('all') && <Check className="h-2.5 w-2.5" />}
                </div>
                <span>All Namespaces</span>
              </div>
              <div className="my-1 h-px bg-border" />
              {namespaces.map(ns => {
                const isSelected = selectedNamespaces.has(ns);
                return (
                  <div
                    key={ns}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                    onClick={() => toggleNs(ns)}
                  >
                    <div className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <span className="truncate">{ns}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pod multi-select */}
        <div className="relative flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Pods</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPodDropdownOpen(o => !o)}
              className="flex min-w-[130px] items-center justify-between gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm outline-none focus:border-primary"
            >
              <span className="truncate">
                {loading ? (
                  <LoadingIndicator size="xs" label="Loading..." />
                ) : (selectedPods.size === 0 ? 'All Pods' : `${selectedPods.size} selected`)}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); reloadPods(); }}
              title="Reload pods"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin text-primary")} />
            </button>
          </div>
          {isPodDropdownOpen && (
            <div className="absolute top-full left-10 z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Pods</span>
                <button
                  onClick={(e) => { e.stopPropagation(); reloadPods(); }}
                  title="Reload pods"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className={cn("h-2.5 w-2.5", loading && "animate-spin text-primary")} />
                  <span>Reload</span>
                </button>
              </div>
              <div className="my-1 h-px bg-border" />
              {loading ? (
                <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
                  <LoadingIndicator size="sm" label="Fetching pods…" className="gap-2" />
                </div>
              ) : Object.keys(groupedPods).length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  No pods found in selected namespace{selectedNamespaces.size > 1 ? 's' : ''}
                </div>
              ) : (
                <>
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                    onClick={() => setSelectedPods(new Set())}
                  >
                    <div className="flex h-3.5 w-3.5 items-center justify-center rounded border border-border">
                      {selectedPods.size === 0 && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <span>All Pods</span>
                  </div>
                  <div className="my-1 h-px bg-border" />
                  {Object.entries(groupedPods).map(([ns, pods]) => (
                    <div key={ns} className="mb-2 last:mb-0">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 rounded-sm mb-1">
                        {ns}
                      </div>
                      {pods.map(pod => {
                        const isSelected = selectedPods.has(pod.id);
                        return (
                          <div
                            key={pod.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted ml-1"
                            onClick={() => togglePod(pod.id)}
                          >
                            <div className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                              {isSelected && <Check className="h-2.5 w-2.5" />}
                            </div>
                            <span className="truncate">{pod.data.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Metric */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Metric</label>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium shadow-sm outline-none focus:border-primary"
            value={selectedMetric}
            onChange={e => setSelectedMetric(e.target.value as TelemetryMetricType)}
          >
            <option value="throughput">Throughput (KB/s)</option>
            <option value="packetRate">Packet Rate (pps)</option>
            <option value="activeConnections">Active TCP Connections</option>
            <option value="tcpRetransmission">TCP Retransmission Rate (%)</option>
            <option value="tcpRtt">TCP RTT (ms)</option>
          </select>
        </div>

        {/* Aggregator */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Aggregator</label>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm outline-none focus:border-primary"
            value={aggregator}
            onChange={e => setAggregator(e.target.value as AggregationMethod)}
          >
            <option value="instantaneous">Instantaneous (Live)</option>
            <option value="sum">Sum (Cumulative)</option>
            <option value="average">Average (Moving)</option>
            <option value="max">Max (Peak)</option>
          </select>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Play / Pause Toggle Button */}
        <button
          onClick={() => setIsStreaming(s => !s)}
          title={isStreaming ? "Pause live streaming" : "Resume live streaming"}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors",
            isStreaming
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
              : "border-border bg-background text-muted-foreground hover:bg-muted"
          )}
        >
          {isStreaming ? (
            <>
              <Pause className="h-3 w-3 fill-current" />
              <span>Live</span>
            </>
          ) : (
            <>
              <Play className="h-3 w-3 fill-current" />
              <span>Paused</span>
            </>
          )}
        </button>

        {/* Polling Interval Select */}
        <div className="flex items-center gap-1.5">
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm outline-none focus:border-primary"
            value={pollingInterval}
            onChange={e => setPollingInterval(e.target.value as PollingIntervalOption)}
            title="Flow refresh interval"
          >
            <option value="2s">Every 2s</option>
            <option value="5s">Every 5s</option>
            <option value="10s">Every 10s</option>
            <option value="30s">Every 30s</option>
            <option value="manual">Manual Refresh</option>
          </select>
        </div>

        {/* Pod Life / Age Inactivity Expiration */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Pod Life</span>
          </label>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium shadow-sm outline-none focus:border-primary"
            value={podAge}
            onChange={e => handlePodAgeChange(e.target.value as PodAgeOption)}
            title="Pod inactivity expiration (hides pods and connecting edges if no traffic within this window)"
          >
            <option value="10s">10s (10 seconds)</option>
            <option value="1m">1m (1 minute)</option>
            <option value="2m">2m (2 minutes)</option>
            <option value="3m">3m (3 minutes)</option>
            <option value="off">Off (Keep all)</option>
          </select>
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={() => setManualTriggerCount(c => c + 1)}
          disabled={isRefreshingFlows}
          title="Fetch latest network flows immediately"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", isRefreshingFlows && "animate-spin text-primary")} />
          <span>Refresh Flows</span>
        </button>

        {/* View Mode Toggle (Pods vs Workloads) */}
        <div className="flex items-center rounded-md border border-border bg-background p-0.5 shadow-sm">
          <button
            onClick={() => setViewMode('pods')}
            title="Pod View: inspect individual replica connections"
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors",
              viewMode === 'pods'
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Box className="h-3 w-3" />
            <span>Pods</span>
          </button>
          <button
            onClick={() => setViewMode('workloads')}
            title="Workload View: aggregate traffic per deployment"
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors",
              viewMode === 'workloads'
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-3 w-3" />
            <span>Workloads</span>
          </button>
        </div>

        {/* Auto Arrange */}
        <button
          onClick={resetLayout}
          title="Auto-arrange layout to prevent overlapping"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors outline-none focus:border-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Auto Arrange</span>
        </button>
      </div>

      {/* Graph canvas */}
      <div className="relative min-h-0 flex-1" onClick={() => { setIsPodDropdownOpen(false); setIsNsDropdownOpen(false); }}>
        {/* Floating Inactivity Toasts */}
        <InactivityToastStack notices={inactivityNotices} onDismiss={dismissNotice} />
        {loading ? (
          <div className="flex h-full w-full flex-col items-center justify-center space-y-4 bg-background/50 backdrop-blur-xs">
            <LoadingIndicator size="lg" label="Fetching live data…" className="flex-col gap-3" />
          </div>
        ) : filteredNodes.length > 0 ? (
          <NetworkGraphCanvas
            nodes={filteredNodes}
            edges={displayedEdges}
            selectedMetric={selectedMetric}
            aggregator={aggregator}
            edgeStates={edgeStates}
            onNodePositionChange={(id, pos) => positionsRef.current.set(id, pos)}
            resetKey={resetKey}
            heatmapConfig={heatmapConfig}
            onHeatmapConfigChange={setHeatmapConfig}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No pods match the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}
