'use client';

import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

import { EDGE_RELATIONSHIP_CONFIG, type RelationshipCategory } from '@/config/constants';

function OwnershipEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const edgeData = data as { isInvestigationPath?: boolean; dimmed?: boolean; highlighted?: boolean; relationshipCategory?: RelationshipCategory } | undefined;
  const isInvestigationPath = edgeData?.isInvestigationPath === true;
  const isHighlighted = edgeData?.highlighted === true;
  const isDimmed = edgeData?.dimmed === true;
  const catConfig = EDGE_RELATIONSHIP_CONFIG[edgeData?.relationshipCategory ?? 'ownership'] ?? EDGE_RELATIONSHIP_CONFIG.ownership;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: isHighlighted ? catConfig.color : selected || isInvestigationPath ? 'var(--ring)' : catConfig.color,
        strokeWidth: isHighlighted ? 3.5 : selected || isInvestigationPath ? 3.0 : 1.8,
        strokeDasharray: catConfig.strokeDasharray ?? '6 3',
        opacity: isDimmed ? 0.15 : isHighlighted || selected || isInvestigationPath ? 1 : 0.7,
        filter: isHighlighted
          ? `drop-shadow(0 0 8px ${catConfig.color}) drop-shadow(0 0 14px ${catConfig.color})`
          : selected || isInvestigationPath
            ? 'drop-shadow(0 0 4px color-mix(in oklch, var(--ring) 75%, transparent))'
            : undefined,
        zIndex: isHighlighted ? 1000 : 1,
      }}
    />
  );
}

export const OwnershipEdge = memo(OwnershipEdgeComponent);
