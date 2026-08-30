'use client';

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { EDGE_RELATIONSHIP_CONFIG, type RelationshipCategory } from '@/config/constants';
import { useGraphStore } from '@/stores/graph-store';

export interface K8sEdgeData {
  relationshipCategory: RelationshipCategory;
  confidence?: string;
  connectionString?: string;
  protocol?: string;
  port?: number | null;
  isCrossNamespace?: boolean;
  networkPolicyStatus?: string;
  [key: string]: unknown;
}

function K8sEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const highlightedCategory = useGraphStore(s => s.highlightedEdgeCategory);
  const edgeData = data as unknown as K8sEdgeData;
  const category = edgeData?.relationshipCategory ?? 'network';
  const config = EDGE_RELATIONSHIP_CONFIG[category] ?? EDGE_RELATIONSHIP_CONFIG.network;

  const isCategoryHighlighted = highlightedCategory === category;
  const isAnyCategoryHighlighted = highlightedCategory !== null;
  const isDimmed = isAnyCategoryHighlighted && !isCategoryHighlighted;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Calculate visual properties
  let strokeWidth = config.strokeWidth;
  if (isCategoryHighlighted) {
    strokeWidth = Math.max(config.strokeWidth * 1.8, 3.5);
  } else if (selected) {
    strokeWidth = Math.max(config.strokeWidth * 1.5, 3.0);
  } else if (isDimmed) {
    strokeWidth = Math.max(config.strokeWidth * 0.8, 1);
  }

  const opacity = isDimmed ? 0.15 : isCategoryHighlighted ? 1.0 : selected ? 1.0 : 0.8;
  const strokeColor = isCategoryHighlighted || selected ? config.color : isDimmed ? '#4b5563' : config.color;

  const filter = isCategoryHighlighted
    ? `drop-shadow(0 0 8px ${config.color}) drop-shadow(0 0 16px ${config.color})`
    : selected
      ? `drop-shadow(0 0 6px ${config.color})`
      : undefined;

  const markerId = `marker-${category}-${id}`;

  return (
    <>
      <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
        <defs>
          {config.hasArrow && (
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={strokeColor} opacity={opacity} />
            </marker>
          )}
          {config.isBiDirectional && (
            <marker
              id={`${markerId}-start`}
              viewBox="0 0 10 10"
              refX="2"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 8 1.5 L 0 5 L 8 8.5 z" fill={strokeColor} opacity={opacity} />
            </marker>
          )}
        </defs>
      </svg>

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={config.hasArrow ? `url(#${markerId})` : undefined}
        markerStart={config.isBiDirectional ? `url(#${markerId}-start)` : undefined}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: config.strokeDasharray,
          opacity,
          filter,
          transition: 'all 0.25s ease-in-out',
          zIndex: isCategoryHighlighted ? 1000 : selected ? 900 : 1,
        }}
      />

      {/* Animated flow dots when category is highlighted or solid network flow */}
      {(isCategoryHighlighted || (category === 'network' && !isDimmed)) && (
        <circle r={isCategoryHighlighted ? 4 : 3} fill={config.color} opacity={isDimmed ? 0.2 : 0.9}>
          <animateMotion dur={isCategoryHighlighted ? "1.8s" : "3.5s"} repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {/* Edge label */}
      {!isDimmed && (edgeData?.protocol || edgeData?.port || edgeData?.connectionString) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto cursor-pointer"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              zIndex: isCategoryHighlighted ? 1001 : 950,
            }}
          >
            <div
              className="text-[9px] px-1.5 py-0.5 rounded font-mono transition-all backdrop-blur-md"
              style={{
                background: selected || isCategoryHighlighted ? 'rgba(9, 9, 11, 0.95)' : 'rgba(15, 15, 23, 0.85)',
                border: `1px solid ${selected || isCategoryHighlighted ? config.color : 'rgba(255,255,255,0.1)'}`,
                color: isCategoryHighlighted ? '#ffffff' : config.color,
                boxShadow: isCategoryHighlighted ? `0 0 10px ${config.color}40` : undefined,
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {edgeData.protocol && edgeData.protocol !== 'unknown' ? `${edgeData.protocol}` : ''}
              {edgeData.port ? `:${edgeData.port}` : ''}
              {!edgeData.protocol && !edgeData.port && edgeData.connectionString
                ? edgeData.connectionString.substring(0, 20)
                : ''}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const K8sEdge = memo(K8sEdgeComponent);
