'use client';

import React, { useState, useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import {
  type TelemetryMetricType,
  type MetricEdgeData,
  type HeatmapConfig,
  METRIC_THRESHOLD_METAS,
  HEATMAP_COLOR_PRESETS,
} from '@/lib/telemetry/mock-data';
import type { AggregationMethod, EdgeMetricsState } from './LiveNetworkingView';
import { Flame, ChevronUp, ChevronDown, AlertTriangle, ShieldCheck, ArrowDownUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeatmapBarProps {
  selectedMetric: TelemetryMetricType;
  heatmapConfig: HeatmapConfig;
  onHeatmapConfigChange: (newConfig: HeatmapConfig) => void;
  edges: Edge<MetricEdgeData, 'metricEdge'>[];
  edgeStates: Record<string, EdgeMetricsState>;
  aggregator: AggregationMethod;
}

export function HeatmapBar({
  selectedMetric,
  heatmapConfig,
  onHeatmapConfigChange,
  edges,
  edgeStates,
  aggregator,
}: HeatmapBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const meta = METRIC_THRESHOLD_METAS[selectedMetric] || {
    label: 'Metric',
    unit: '',
    defaultMinThreshold: 50,
    defaultMaxThreshold: 500,
    defaultThreshold: 500,
    min: 0,
    max: 1000,
    step: 10,
    description: '',
  };

  const isInverted = Boolean(heatmapConfig.isInverted);
  const minThreshold = heatmapConfig.minThresholds?.[selectedMetric] ?? meta.defaultMinThreshold;
  const maxThreshold = heatmapConfig.maxThresholds?.[selectedMetric] ?? heatmapConfig.thresholds[selectedMetric] ?? meta.defaultMaxThreshold;

  // Calculate live edges statistics against the min/max thresholds with invert support
  const { exceededCount, totalEdges, maxEdgeValue, minEdgeValue } = useMemo(() => {
    let count = 0;
    let maxVal = 0;
    let minVal = Infinity;

    for (const edge of edges) {
      let val = edge.data?.metrics?.[selectedMetric] ?? 0;
      const state = edgeStates[edge.id];
      if (state) {
        switch (aggregator) {
          case 'instantaneous':
            val = state.latest;
            break;
          case 'sum':
            val = state.sum;
            break;
          case 'average':
            val = state.count > 0 ? state.sum / state.count : 0;
            break;
          case 'max':
            val = state.max;
            break;
        }
      }

      // Throughput is evaluated in KB/s (1 KB = 1024 bytes)
      const normalized = selectedMetric === 'throughput' ? val / 1024 : val;
      if (normalized > maxVal) maxVal = normalized;
      if (normalized < minVal) minVal = normalized;

      if (isInverted) {
        // Inverted: alert when value is low (<= minThreshold)
        if (normalized <= minThreshold) count++;
      } else {
        // Standard: alert when value is high (>= maxThreshold)
        if (normalized >= maxThreshold) count++;
      }
    }

    return {
      exceededCount: count,
      totalEdges: edges.length,
      maxEdgeValue: maxVal,
      minEdgeValue: minVal === Infinity ? 0 : minVal,
    };
  }, [edges, edgeStates, selectedMetric, aggregator, minThreshold, maxThreshold, isInverted]);

  const handleMinThresholdChange = (val: number) => {
    const clamped = Math.max(meta.min, Math.min(val, maxThreshold));
    onHeatmapConfigChange({
      ...heatmapConfig,
      minThresholds: {
        ...heatmapConfig.minThresholds,
        [selectedMetric]: clamped,
      },
    });
  };

  const handleMaxThresholdChange = (val: number) => {
    const clamped = Math.max(minThreshold, Math.min(val, meta.max));
    onHeatmapConfigChange({
      ...heatmapConfig,
      maxThresholds: {
        ...heatmapConfig.maxThresholds,
        [selectedMetric]: clamped,
      },
      thresholds: {
        ...heatmapConfig.thresholds,
        [selectedMetric]: clamped,
      },
    });
  };

  const handleToggleInvert = (e: React.MouseEvent) => {
    e.stopPropagation();
    onHeatmapConfigChange({
      ...heatmapConfig,
      isInverted: !isInverted,
    });
  };

  const handleColorSelect = (hex: string) => {
    onHeatmapConfigChange({
      ...heatmapConfig,
      color: hex,
    });
  };

  // Quick preset pairs [min, max] based on metric
  const quickPresets = useMemo(() => {
    switch (selectedMetric) {
      case 'throughput':
        return [
          { label: 'Low (10-100)', min: 10, max: 100 },
          { label: 'Normal (50-500)', min: 50, max: 500 },
          { label: 'High (200-2000)', min: 200, max: 2000 },
        ];
      case 'packetRate':
        return [
          { label: 'Low (50-300)', min: 50, max: 300 },
          { label: 'Normal (100-1000)', min: 100, max: 1000 },
          { label: 'High (500-5000)', min: 500, max: 5000 },
        ];
      case 'activeConnections':
        return [
          { label: 'Low (2-10)', min: 2, max: 10 },
          { label: 'Normal (5-50)', min: 5, max: 50 },
          { label: 'High (20-150)', min: 20, max: 150 },
        ];
      case 'tcpRetransmission':
        return [
          { label: 'Strict (0.5-2%)', min: 0.5, max: 2 },
          { label: 'Default (1-5%)', min: 1, max: 5 },
          { label: 'Lenient (2-10%)', min: 2, max: 10 },
        ];
      case 'tcpRtt':
        return [
          { label: 'Fast (20-200ms)', min: 20, max: 200 },
          { label: 'Normal (100-1000ms)', min: 100, max: 1000 },
          { label: 'Slow (500-2500ms)', min: 500, max: 2500 },
        ];
      default:
        return [
          { label: 'Default', min: 10, max: 100 },
        ];
    }
  }, [selectedMetric]);

  // Visual gradient calculation:
  // Standard: Base Color (normal low) -> Amber (mid range) -> Alert Color (exceeded high)
  // Inverted: Alert Color (exceeded low) -> Amber (mid range) -> Base Color (normal high)
  const gradientStyle = useMemo(() => {
    if (isInverted) {
      return `linear-gradient(to right, ${heatmapConfig.color} 0%, #f59e0b 45%, ${heatmapConfig.baseColor} 75%, ${heatmapConfig.baseColor} 100%)`;
    }
    return `linear-gradient(to right, ${heatmapConfig.baseColor} 0%, ${heatmapConfig.baseColor} 45%, #f59e0b 75%, ${heatmapConfig.color} 100%)`;
  }, [isInverted, heatmapConfig.color, heatmapConfig.baseColor]);

  return (
    <div className="w-full pointer-events-auto select-none rounded-xl border border-border/80 bg-background/95 shadow-2xl backdrop-blur-md transition-all duration-200 dark:border-border/60 dark:bg-neutral-950/90">
      {/* Header bar (fixed height & stable layout to prevent any dislocation) */}
      <div
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/30 rounded-xl"
      >
        {/* Left: Icon + Metric Name + Threshold Bounds */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white shadow-xs"
            style={{ backgroundColor: heatmapConfig.color }}
          >
            <Flame className="h-3 w-3" />
          </div>

          <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-[170px]" title={`${meta.label} Heatmap`}>
            {meta.label}
          </span>

          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
            {isInverted ? `Alert: ≤ ${minThreshold} ${meta.unit}` : `Alert: ≥ ${maxThreshold} ${meta.unit}`}
          </span>

          {isInverted && (
            <span className="shrink-0 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
              INVERTED
            </span>
          )}
        </div>

        {/* Right: Invert quick button + Status badge + Collapse button */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Invert Toggle Button in header */}
          <button
            type="button"
            onClick={handleToggleInvert}
            title={isInverted ? "Inverted mode active (alerting on small values). Click to switch to normal mode." : "Click to invert heatmap (alert on small values, e.g. unpaginated DB or low stream)."}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors",
              isInverted
                ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-xs"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <ArrowDownUp className="h-2.5 w-2.5" />
            <span className="hidden xs:inline">{isInverted ? "Inverted" : "Normal"}</span>
          </button>

          {/* Active status indicator badge */}
          {exceededCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-xs"
              style={{
                backgroundColor: `${heatmapConfig.color}20`,
                borderColor: `${heatmapConfig.color}50`,
                color: heatmapConfig.color,
                borderWidth: '1px',
              }}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              <span className="tabular-nums">{exceededCount} / {totalEdges} alert</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-2.5 w-2.5" />
              <span>All Normal</span>
            </span>
          )}

          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={isExpanded ? "Collapse Heatmap Controls" : "Expand Heatmap Controls"}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Controls & Dual Threshold Visual Bar */}
      {isExpanded && (
        <div className="border-t border-border/60 p-3 pt-2.5 space-y-2.5">
          {/* Visual Heatmap Gradient Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground tabular-nums">
              <span>{isInverted ? `Alert: ≤ ${minThreshold} ${meta.unit}` : `Base (< ${minThreshold})`}</span>
              <span className="font-mono text-foreground">
                Observed: {minEdgeValue.toFixed(selectedMetric === 'tcpRetransmission' ? 1 : 0)} – {maxEdgeValue.toFixed(selectedMetric === 'tcpRetransmission' ? 1 : 0)} {meta.unit}
              </span>
              <span style={{ color: heatmapConfig.color }} className="font-semibold">
                {isInverted ? `Normal (> ${maxThreshold} ${meta.unit})` : `Alert: ≥ ${maxThreshold} ${meta.unit}`}
              </span>
            </div>

            {/* Gradient Visual Strip with Dual Markers */}
            <div className="relative h-3 w-full overflow-hidden rounded-full border border-border/70 shadow-inner">
              <div
                className="h-full w-full transition-all duration-300"
                style={{ background: gradientStyle }}
              />
              {/* Min Threshold Marker */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-amber-400 shadow-md"
                style={{ left: '45%', transform: 'translateX(-50%)' }}
                title={`Min threshold: ${minThreshold} ${meta.unit}`}
              />
              {/* Max Threshold Marker */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white shadow-md"
                style={{ left: '75%', transform: 'translateX(-50%)' }}
                title={`Max threshold: ${maxThreshold} ${meta.unit}`}
              />
            </div>

            <div className="flex justify-between text-[9px] text-muted-foreground font-mono tabular-nums">
              <span>{isInverted ? `Alert (Low)` : `0 ${meta.unit}`}</span>
              <span className="text-amber-500 dark:text-amber-400">
                Min: {minThreshold} {meta.unit}
              </span>
              <span style={{ color: heatmapConfig.color }} className="font-bold">
                Max: {maxThreshold} {meta.unit}
              </span>
            </div>
          </div>

          {/* Min & Max Threshold Value Set */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/40">
            {/* Min Threshold Set */}
            <div className="flex items-center justify-between gap-1.5 bg-muted/40 rounded-lg p-1.5 border border-border/50">
              <span className="text-[10px] font-semibold text-muted-foreground">Min Threshold:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={meta.min}
                  max={maxThreshold}
                  step={meta.step}
                  value={minThreshold}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      handleMinThresholdChange(val);
                    }
                  }}
                  className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono font-bold text-foreground shadow-xs outline-none focus:border-primary tabular-nums"
                />
                <span className="text-[10px] font-medium text-muted-foreground">{meta.unit}</span>
                <input
                  type="range"
                  min={meta.min}
                  max={maxThreshold}
                  step={meta.step}
                  value={minThreshold}
                  onChange={e => handleMinThresholdChange(Number(e.target.value))}
                  className="h-1.5 w-16 cursor-pointer accent-amber-500"
                  title={`Min threshold: ${minThreshold} ${meta.unit}`}
                />
              </div>
            </div>

            {/* Max Threshold Set */}
            <div className="flex items-center justify-between gap-1.5 bg-muted/40 rounded-lg p-1.5 border border-border/50">
              <span className="text-[10px] font-semibold text-muted-foreground">Max Threshold:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={minThreshold}
                  max={meta.max}
                  step={meta.step}
                  value={maxThreshold}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      handleMaxThresholdChange(val);
                    }
                  }}
                  className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono font-bold text-foreground shadow-xs outline-none focus:border-primary tabular-nums"
                />
                <span className="text-[10px] font-medium text-muted-foreground">{meta.unit}</span>
                <input
                  type="range"
                  min={minThreshold}
                  max={meta.max}
                  step={meta.step}
                  value={maxThreshold}
                  onChange={e => handleMaxThresholdChange(Number(e.target.value))}
                  className="h-1.5 w-16 cursor-pointer accent-primary"
                  title={`Max threshold: ${maxThreshold} ${meta.unit}`}
                />
              </div>
            </div>
          </div>

          {/* Preset Buttons & Invert Switch */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
            {/* Quick preset chips */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Presets:</span>
              {quickPresets.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onHeatmapConfigChange({
                      ...heatmapConfig,
                      minThresholds: {
                        ...heatmapConfig.minThresholds,
                        [selectedMetric]: preset.min,
                      },
                      maxThresholds: {
                        ...heatmapConfig.maxThresholds,
                        [selectedMetric]: preset.max,
                      },
                      thresholds: {
                        ...heatmapConfig.thresholds,
                        [selectedMetric]: preset.max,
                      },
                    });
                  }}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors",
                    minThreshold === preset.min && maxThreshold === preset.max
                      ? "bg-primary text-primary-foreground font-bold shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Invert Toggle Switch with Descriptive Label */}
            <button
              type="button"
              onClick={handleToggleInvert}
              title="Toggle Invert mode: when inverted, alert triggers for values <= Min threshold (useful for checking services with low throughput or unpaginated DB streaming)."
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold shadow-xs transition-colors",
                isInverted
                  ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <ArrowDownUp className="h-3 w-3" />
              <span>Invert: {isInverted ? "ON (Alert ≤ Min)" : "OFF (Alert ≥ Max)"}</span>
            </button>
          </div>

          {/* Heatmap Color Selector Swatches */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
            <span className="text-[11px] font-medium text-muted-foreground">Alert Color:</span>
            <div className="flex items-center gap-1.5">
              {HEATMAP_COLOR_PRESETS.map(preset => {
                const isSelected = heatmapConfig.color.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => handleColorSelect(preset.hex)}
                    title={`${preset.label} (${preset.hex})`}
                    className={cn(
                      "h-5 w-5 rounded-full transition-transform hover:scale-110",
                      isSelected && "ring-2 ring-offset-2 ring-foreground scale-110 shadow-sm"
                    )}
                    style={{ backgroundColor: preset.hex }}
                  />
                );
              })}

              {/* Custom Color Picker Input */}
              <label
                className="relative flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border/80 overflow-hidden"
                title="Choose custom color"
              >
                <input
                  type="color"
                  value={heatmapConfig.color}
                  onChange={e => handleColorSelect(e.target.value)}
                  className="absolute -inset-2 h-10 w-10 cursor-pointer opacity-0"
                />
                <div
                  className="h-full w-full rounded-full"
                  style={{ backgroundColor: heatmapConfig.color }}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
