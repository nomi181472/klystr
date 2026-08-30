'use client';

import { memo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { CONFIDENCE_CONFIG, EDGE_RELATIONSHIP_CONFIG, type RelationshipCategory } from '@/config/constants';

export interface CommunicationEdgeData {
  confidence: string;
  connectionString: string;
  protocol: string;
  port: number | null;
  isCrossNamespace: boolean;
  networkPolicyStatus: string;
  isInvestigationPath?: boolean;
  relationshipCategory?: RelationshipCategory;
  highlighted?: boolean;
  dimmed?: boolean;
  [key: string]: unknown;
}

function CommunicationEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as unknown as CommunicationEdgeData;
  const confidence = (edgeData?.confidence ?? 'Unknown-External') as keyof typeof CONFIDENCE_CONFIG;
  const config = CONFIDENCE_CONFIG[confidence] ?? CONFIDENCE_CONFIG['Unknown-External'];
  const catConfig = EDGE_RELATIONSHIP_CONFIG[edgeData?.relationshipCategory ?? 'network'] ?? EDGE_RELATIONSHIP_CONFIG.network;

  const isBlocked = edgeData?.networkPolicyStatus === 'likely-blocked';
  const isCrossNs = edgeData?.isCrossNamespace === true;
  const isAnimated = edgeData?.animate !== false;
  const isInvestigationPath = edgeData?.isInvestigationPath === true;
  const isHighlighted = edgeData?.highlighted === true;
  const isDimmed = edgeData?.dimmed === true;
  const [isHovered, setIsHovered] = useState(false);

  // Relationship color and dash patterns stay visible without requiring a legend selection.
  const strokeColor = isHighlighted
    ? catConfig.color
    : selected || isInvestigationPath
      ? 'var(--ring)'
      : isBlocked
        ? 'var(--destructive)'
        : catConfig.color;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const strokeDasharray = isBlocked
    ? '6 3'
    : catConfig.strokeDasharray ?? (config.strokeStyle === 'dashed' ? '8 4' : config.strokeStyle === 'dotted' ? '3 3' : undefined);

  // Label text
  const labelText = edgeData?.protocol && edgeData.protocol !== 'unknown'
    ? `${edgeData.protocol}${edgeData?.port ? `:${edgeData.port}` : ''}`
    : edgeData?.port
      ? `:${edgeData.port}`
      : edgeData?.connectionString
        ? edgeData.connectionString.substring(0, 20)
        : '';
  const showLabel = Boolean(labelText) && (selected || isHovered || isInvestigationPath || isBlocked || isCrossNs);

  return (
    <>
      {/* Cross-namespace: render a subtle wider ghost path underneath */}
      {isCrossNs && !isBlocked && (
        <BaseEdge
          id={`${id}-crossns-bg`}
          path={edgePath}
          style={{
            stroke: 'var(--cross-namespace)',
            strokeWidth: 4,
            opacity: selected ? 0.3 : 0.12,
            strokeDasharray: undefined,
            pointerEvents: 'none',
          }}
        />
      )}

      <g onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={!isAnimated ? markerEnd : undefined}
          interactionWidth={18}
          style={{
            stroke: strokeColor,
            strokeWidth: isHighlighted ? Math.max(3.5, catConfig.strokeWidth * 1.5) : selected || isInvestigationPath ? Math.max(2.5, catConfig.strokeWidth * 1.25) : isBlocked ? 2 : Math.max(1.5, catConfig.strokeWidth),
            strokeDasharray,
            opacity: isDimmed ? 0.15 : isHighlighted || selected || isInvestigationPath || isBlocked ? 1 : isHovered ? 0.95 : 0.72,
            filter: isHighlighted
              ? `drop-shadow(0 0 8px ${catConfig.color}) drop-shadow(0 0 14px ${catConfig.color})`
              : selected || isInvestigationPath
                ? 'drop-shadow(0 0 4px color-mix(in oklch, var(--ring) 75%, transparent))'
                : undefined,
            zIndex: isHighlighted ? 1000 : 1,
          }}
        />
      </g>

      {/* Animated flow dots for confirmed, non-blocked edges */}
      {isAnimated && confidence === 'Confirmed' && !isBlocked && !isDimmed && (
        <circle r="3" fill={strokeColor} opacity={0.8}>
          <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {/* Edge label */}
      {showLabel && <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto cursor-pointer"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          <div
            className="flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] font-medium shadow-md transition-all"
            style={{
              background: 'color-mix(in oklch, var(--card) 97%, transparent)',
              border: `1px solid ${selected ? strokeColor : isBlocked ? 'color-mix(in oklch, var(--destructive) 25%, transparent)' : isCrossNs ? 'color-mix(in oklch, var(--cross-namespace) 25%, transparent)' : 'color-mix(in oklch, var(--foreground) 18%, transparent)'}`,
              outline: selected ? `2px solid color-mix(in oklch, ${strokeColor} 42%, transparent)` : undefined,
              color: 'var(--foreground)',
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={isBlocked ? 'Likely blocked by NetworkPolicy' : isCrossNs ? `Cross-namespace: ${labelText}` : labelText}
          >
            {isBlocked && (
              <svg width="8" height="8" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="8" cy="8" r="7" stroke="var(--destructive)" strokeWidth="2" />
                <line x1="4" y1="4" x2="12" y2="12" stroke="var(--destructive)" strokeWidth="2" />
              </svg>
            )}
            {isCrossNs && !isBlocked && (
              <svg width="7" height="7" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 6h10M7 2l4 4-4 4" stroke="var(--cross-namespace)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isBlocked ? 'blocked' : labelText}
            </span>
          </div>
        </div>
      </EdgeLabelRenderer>}
    </>
  );
}

export const CommunicationEdge = memo(CommunicationEdgeComponent);
