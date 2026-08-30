'use client';

import { useMemo, useState } from 'react';
import { Panel, type Edge } from '@xyflow/react';
import {
  EDGE_RELATIONSHIP_CONFIG,
  type RelationshipCategory,
} from '@/config/constants';
import { useGraphStore } from '@/stores/graph-store';
import { ChevronDown } from 'lucide-react';

interface EdgeLegendPanelProps {
  visibleEdges?: Edge[];
  className?: string;
}

export function EdgeLegendPanel({ visibleEdges, className }: EdgeLegendPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const graphData = useGraphStore(s => s.graphData);
  const highlightedCategory = useGraphStore(s => s.highlightedEdgeCategory);
  const toggleHighlightedCategory = useGraphStore(s => s.toggleHighlightedEdgeCategory);
  const setHighlightedCategory = useGraphStore(s => s.setHighlightedEdgeCategory);

  // Compute categories currently present in visible graph edges
  const activeCategoriesWithCount = useMemo(() => {
    const counts = new Map<RelationshipCategory, number>();

    if (visibleEdges && visibleEdges.length > 0) {
      for (const edge of visibleEdges) {
        const cat = (edge.data?.relationshipCategory as RelationshipCategory) ?? (edge.type === 'ownership' ? 'ownership' : 'network');
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    } else if (graphData?.edges && graphData.edges.length > 0) {
      for (const edge of graphData.edges) {
        const cat = edge.relationshipCategory ?? (edge.edgeKind === 'ownership' ? 'ownership' : 'network');
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }

    // ONLY show legend items for edge types currently visible in active view (count > 0)
    return Object.values(EDGE_RELATIONSHIP_CONFIG)
      .filter(config => (counts.get(config.id) ?? 0) > 0)
      .map(config => ({
        ...config,
        count: counts.get(config.id) ?? 0,
      }));
  }, [visibleEdges, graphData]);

  if (activeCategoriesWithCount.length === 0) {
    return null;
  }

  return (
    <Panel position="bottom-right" className={className ?? '!bottom-14 !right-3'}>
      <div className="bg-card/95 border border-border/80 backdrop-blur-lg shadow-xl rounded-lg overflow-hidden transition-all duration-200 w-72 text-xs select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-foreground tracking-tight text-[11px] uppercase">
              Edge Relationships
            </span>
            <span className="text-[10px] bg-muted text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-full font-mono">
              {activeCategoriesWithCount.length} visible
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {highlightedCategory && (
              <button
                onClick={() => setHighlightedCategory(null)}
                className="text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded transition-colors font-medium"
                title="Clear Highlight"
              >
                Reset
              </button>
            )}

            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/60 transition-colors"
              aria-label={isCollapsed ? 'Expand Legend' : 'Collapse Legend'}
            >
              <ChevronDown
                size={14}
                className={`transform transition-transform duration-200 ${
                  isCollapsed ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Legend Body */}
        {!isCollapsed && (
          <div className="p-2 space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
            <div className="px-1 py-0.5 text-[10px] text-muted-foreground flex justify-between items-center">
              <span>Click legend item to highlight</span>
              {highlightedCategory && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">Highlight active</span>
              )}
            </div>

            {activeCategoriesWithCount.map(item => {
              const isSelected = highlightedCategory === item.id;
              const isOtherSelected = highlightedCategory !== null && !isSelected;

              return (
                <button
                  key={item.id}
                  onClick={() => toggleHighlightedCategory(item.id)}
                  className={`w-full text-left flex items-center justify-between p-2 rounded-md transition-all duration-150 group border ${
                    isSelected
                      ? 'bg-accent border-primary/50 text-foreground ring-1 ring-primary/40 shadow-sm'
                      : isOtherSelected
                        ? 'opacity-40 hover:opacity-80 bg-transparent border-transparent hover:bg-muted/40'
                        : 'bg-muted/30 hover:bg-muted/80 border-transparent hover:border-border'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    {/* SVG Line Graphic Preview */}
                    <div className="w-9 h-4 flex items-center justify-center shrink-0">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 36 10">
                        <defs>
                          <marker
                            id={`legend-arrow-${item.id}`}
                            viewBox="0 0 10 10"
                            refX="6"
                            refY="5"
                            markerWidth="4"
                            markerHeight="4"
                            orient="auto"
                          >
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={item.color} />
                          </marker>
                          {item.isBiDirectional && (
                            <marker
                              id={`legend-arrow-start-${item.id}`}
                              viewBox="0 0 10 10"
                              refX="2"
                              refY="5"
                              markerWidth="4"
                              markerHeight="4"
                              orient="auto-start-reverse"
                            >
                              <path d="M 8 1.5 L 0 5 L 8 8.5 z" fill={item.color} />
                            </marker>
                          )}
                        </defs>
                        <line
                          x1="2"
                          y1="5"
                          x2="30"
                          y2="5"
                          stroke={item.color}
                          strokeWidth={item.strokeWidth * 1.2}
                          strokeDasharray={item.strokeDasharray}
                          markerEnd={item.hasArrow ? `url(#legend-arrow-${item.id})` : undefined}
                          markerStart={item.isBiDirectional ? `url(#legend-arrow-start-${item.id})` : undefined}
                          style={{
                            filter: isSelected ? `drop-shadow(0 0 3px ${item.color})` : undefined,
                          }}
                        />
                      </svg>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`truncate transition-colors text-[11px] ${
                            isSelected ? 'text-foreground font-semibold' : 'text-foreground/90 group-hover:text-foreground font-medium'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <p className="text-[9px] text-muted-foreground truncate leading-tight mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {/* Badge */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded transition-all ${
                        isSelected
                          ? 'bg-primary/20 text-primary font-bold border border-primary/40'
                          : 'bg-muted text-muted-foreground group-hover:text-foreground'
                      }`}
                    >
                      {item.count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
