'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Activity, Network } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { NetworkGraphCanvas } from './NetworkGraphCanvas';
import {
  MOCK_TELEMETRY_NODES,
  MOCK_TELEMETRY_EDGES,
  type TelemetryMetricType,
} from '@/lib/telemetry/mock-data';
import { Check, ChevronDown } from 'lucide-react';

export type AggregationMethod = 'instantaneous' | 'sum' | 'average' | 'max';

export interface EdgeMetricsState {
  latest: number;
  sum: number;
  count: number;
  max: number;
  history: number[];
}

// ── Live Networking sub-view ────────────────────────────────────────────────

function LiveNetworkingView() {
  const [selectedMetric, setSelectedMetric] = useState<TelemetryMetricType>('throughput');
  const [aggregator, setAggregator] = useState<AggregationMethod>('instantaneous');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');
  const [selectedPods, setSelectedPods] = useState<Set<string>>(new Set());
  const [isPodDropdownOpen, setIsPodDropdownOpen] = useState(false);
  const [edgeStates, setEdgeStates] = useState<Record<string, EdgeMetricsState>>({});

  const namespaces = Array.from(new Set(MOCK_TELEMETRY_NODES.map(n => n.data.namespace)));
  const availablePods = MOCK_TELEMETRY_NODES.filter(
    n => namespaceFilter === 'all' || n.data.namespace === namespaceFilter
  );

  // Track metric+aggregator version so we can reset inside the async tick callback.
  // This avoids calling setState synchronously inside a useEffect body.
  const versionRef = useRef(`${selectedMetric}:${aggregator}`);

  // Real-time simulation loop — 1 s tick.
  // Resets accumulated state on the first tick after metric or aggregator changes.
  useEffect(() => {
    versionRef.current = `${selectedMetric}:${aggregator}`;
    const interval = setInterval(() => {
      const version = `${selectedMetric}:${aggregator}`;
      setEdgeStates(prev => {
        const shouldReset = versionRef.current !== version;
        if (shouldReset) versionRef.current = version;
        const nextState: Record<string, EdgeMetricsState> = shouldReset ? {} : { ...prev };
        MOCK_TELEMETRY_EDGES.forEach(edge => {
          const baseValue = edge.data?.metrics?.[selectedMetric] ?? 0;
          const jitter = baseValue * 0.3 * (Math.random() * 2 - 1);
          let packetValue = Math.max(0, baseValue + jitter);
          if (selectedMetric === 'activeConnections' || selectedMetric === 'packetRate') {
            packetValue = Math.round(packetValue);
          }
          const current = nextState[edge.id] ?? { latest: 0, sum: 0, count: 0, max: 0, history: [] };
          nextState[edge.id] = {
            latest: packetValue,
            sum: current.sum + packetValue,
            count: current.count + 1,
            max: Math.max(current.max, packetValue),
            history: [...current.history, packetValue].slice(-10),
          };
        });
        return nextState;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedMetric, aggregator]);

  const togglePod = (podId: string) => {
    const next = new Set(selectedPods);
    if (next.has(podId)) next.delete(podId);
    else next.add(podId);
    setSelectedPods(next);
  };

  const filteredNodes = React.useMemo(() =>
    availablePods.filter(n => selectedPods.size === 0 || selectedPods.has(n.id)),
    [availablePods, selectedPods]
  );

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

  const filteredEdges = React.useMemo(() =>
    MOCK_TELEMETRY_EDGES.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredNodeIds.size, filteredNodes]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filters toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        {/* Namespace */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Namespace</label>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm outline-none focus:border-primary"
            value={namespaceFilter}
            onChange={e => {
              setNamespaceFilter(e.target.value);
              setSelectedPods(new Set());
            }}
          >
            <option value="all">All</option>
            {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
        </div>

        {/* Pod multi-select */}
        <div className="relative flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Pods</label>
          <button
            onClick={() => setIsPodDropdownOpen(o => !o)}
            className="flex min-w-[130px] items-center justify-between gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm outline-none focus:border-primary"
          >
            <span className="truncate">
              {selectedPods.size === 0 ? 'All Pods' : `${selectedPods.size} selected`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
          {isPodDropdownOpen && (
            <div className="absolute top-full left-10 z-50 mt-1 max-h-60 w-60 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
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
              {availablePods.map(pod => {
                const isSelected = selectedPods.has(pod.id);
                return (
                  <div
                    key={pod.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
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
            <option value="throughput">Throughput (Bytes/s)</option>
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
      </div>

      {/* Graph canvas */}
      <div className="relative min-h-0 flex-1" onClick={() => setIsPodDropdownOpen(false)}>
        {filteredNodes.length > 0 ? (
          <NetworkGraphCanvas
            nodes={filteredNodes}
            edges={filteredEdges}
            selectedMetric={selectedMetric}
            aggregator={aggregator}
            edgeStates={edgeStates}
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

// ── Root workspace — matches SecurityWorkspace structure exactly ─────────────

export default function TelemetryWorkspace() {
  return (
    <div className="telemetry-workspace flex h-full min-h-0 flex-col bg-background">
      {/* Page header — identical layout to SecurityWorkspace */}
      <div className="shrink-0 border-b border-border bg-card p-4 sm:p-5">
        <PageHeader
          title="Telemetry"
          description="Live Kubernetes network observability and TCP-level traffic analysis."
          icon={<Activity />}
        />
      </div>

      {/* Sub-navigation tabs — same pattern as SecurityWorkspace */}
      <Tabs defaultValue="live-networking" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto border-b border-border px-4 sm:px-5">
          <TabsList className="h-10 w-max bg-transparent p-0 gap-1">
            <TabsTrigger value="live-networking">
              <Network size={14} className="mr-1.5" />
              Live Networking
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab content — no scroll wrapper; canvas manages its own layout */}
        <TabsContent value="live-networking" className="m-0 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
          <LiveNetworkingView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
