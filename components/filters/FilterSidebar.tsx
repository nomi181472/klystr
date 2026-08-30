'use client';

import type { ReactNode } from 'react';
import { useFilterStore } from '@/stores/filter-store';
import { RESOURCE_TYPE_CONFIG, RESOURCE_CATEGORIES, type K8sKind } from '@/config/resource-types';
import { CONFIDENCE_CONFIG, type ConfidenceTier, type NetworkPolicyStatus } from '@/config/constants';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, RotateCcw, Filter, Tag } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { DETECTOR_REGISTRY } from '@/stores/filter-store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FilterSidebarProps {
  namespaces: string[];
}

export function FilterSidebar({ namespaces }: FilterSidebarProps) {
  const {
    selectedNamespaces,
    namespaceSelection, setNamespaces, setNamespaceSelection,
    visibleKinds, toggleKind,
    showCommunicationEdges, setShowCommunicationEdges,
    showOwnershipEdges, setShowOwnershipEdges,
    animateCommunicationEdges, setAnimateCommunicationEdges,
    containerMetaphorDimensions, setContainerMetaphorDimensions,
    namespaceLayout, namespaceLayoutCount, setNamespaceLayout,
    minConfidence, setMinConfidence,
    searchQuery, setSearchQuery,
    crossNamespaceOnly, setCrossNamespaceOnly,
    includeOutOfScope, setIncludeOutOfScope,
    networkPolicyFilter, setNetworkPolicyFilter,
    labelFilter, setLabelFilter,
    activeDetectors, toggleDetector, setActiveDetectors,
    resetFilters,
  } = useFilterStore();

  const toggleConfidence = (tier: ConfidenceTier) => {
    if (minConfidence.includes(tier)) {
      setMinConfidence(minConfidence.filter(t => t !== tier));
    } else {
      setMinConfidence([...minConfidence, tier]);
    }
  };

  const selectionActions = (kind: 'namespaces' | 'kinds' | 'confidence') => {
    if (kind === 'namespaces') {
      setNamespaces(namespaces);
      setNamespaceSelection('all');
    } else if (kind === 'kinds') {
      const kinds = Object.values(RESOURCE_CATEGORIES).flatMap(category => [...category.kinds]) as K8sKind[];
      useFilterStore.getState().setVisibleKinds(new Set(kinds));
    } else {
      setMinConfidence(Object.keys(CONFIDENCE_CONFIG) as ConfidenceTier[]);
    }
  };

  const allKinds = Object.values(RESOURCE_CATEGORIES).flatMap(category => [...category.kinds]) as K8sKind[];
  const defaultKindCount = Object.values(RESOURCE_TYPE_CONFIG).filter(config => config.defaultVisible).length;
  const activeFilterCount = [
    Boolean(searchQuery),
    Boolean(labelFilter),
    namespaceSelection !== 'all',
    visibleKinds.size !== defaultKindCount,
    minConfidence.length !== Object.keys(CONFIDENCE_CONFIG).length,
    networkPolicyFilter !== 'all',
    crossNamespaceOnly,
    !includeOutOfScope,
    !showCommunicationEdges,
    !showOwnershipEdges,
    activeDetectors.size !== DETECTOR_REGISTRY.length,
    containerMetaphorDimensions !== 32,
  ].filter(Boolean).length;
  const toggleSelection = (kind: 'namespaces' | 'kinds' | 'confidence') => {
    const allSelected = kind === 'namespaces'
      ? namespaceSelection === 'all' || (namespaces.length > 0 && selectedNamespaces.length === namespaces.length)
      : kind === 'kinds'
        ? visibleKinds.size === allKinds.length
        : minConfidence.length === Object.keys(CONFIDENCE_CONFIG).length;

    if (allSelected) {
      if (kind === 'namespaces') {
        setNamespaces([]);
        setNamespaceSelection('none');
      } else if (kind === 'kinds') {
        useFilterStore.getState().setVisibleKinds(new Set());
      } else {
        setMinConfidence([]);
      }
    } else {
      selectionActions(kind);
    }
  };

  const section = (title: string, count: string, children: ReactNode, actions?: ReactNode) => (
    <details className="group rounded-lg border border-transparent px-2 py-2 open:border-border/70 open:bg-muted/25" open={title === 'Search'}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">{title}<span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{count}</span></span>
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3">{children}</div>
      {actions}
    </details>
  );

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-primary" />
            <span className="text-base font-semibold text-foreground">Filters</span>
            {activeFilterCount > 0 && <BadgeCount count={activeFilterCount} />}
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters} disabled={activeFilterCount === 0}>
            <RotateCcw size={12} className="mr-1" /> Reset
          </Button>
        </div>

        {section('Search', searchQuery ? 'active' : 'optional', <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-9 border-border bg-card pl-8 text-[13px] focus-visible:border-ring"
          />
        </div>)}

        {section('Label filter', labelFilter ? 'active' : 'optional', <div className="space-y-1.5">
          <div className="relative">
            <Tag size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="app=frontend or just app"
              value={labelFilter}
              onChange={e => setLabelFilter(e.target.value)}
              className="h-9 border-border bg-card pl-8 font-mono text-xs focus-visible:border-ring"
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Filter nodes by label. Use <code className="text-muted-foreground">key=value</code> for exact match or just <code className="text-muted-foreground">key</code> for presence.
          </p>
        </div>)}

        {section('Namespaces', namespaceSelection === 'none' ? 'none' : namespaceSelection === 'all' ? 'all' : `${selectedNamespaces.length}/${namespaces.length}`, <>
          <div className="mb-2"><Button variant="outline" size="sm" className="h-6 w-full text-[10px]" aria-pressed={namespaceSelection === 'all'} onClick={() => toggleSelection('namespaces')}>{namespaceSelection === 'all' ? 'Unselect all' : 'Select all'}</Button></div>
          <div className="space-y-1.5">
            {namespaces.map(ns => (
              <label key={ns} className="flex items-center gap-2 cursor-pointer group">
                <Checkbox
                  checked={namespaceSelection === 'all' || (namespaceSelection === 'selected' && selectedNamespaces.includes(ns))}
                  onCheckedChange={() => {
                    if (namespaceSelection === 'all') {
                      setNamespaces(namespaces.filter(item => item !== ns));
                      setNamespaceSelection('selected');
                    } else if (namespaceSelection === 'none') {
                      setNamespaces([ns]);
                      setNamespaceSelection('selected');
                    } else {
                      const next = selectedNamespaces.includes(ns)
                        ? selectedNamespaces.filter(item => item !== ns)
                        : [...selectedNamespaces, ns];
                      setNamespaces(next);
                      setNamespaceSelection(next.length ? 'selected' : 'none');
                    }
                  }}
                  className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className="font-mono text-xs text-foreground/80 transition-colors group-hover:text-foreground">{ns}</span>
              </label>
            ))}
          </div>
        </>)}

        {section('Resource types', `${visibleKinds.size} on`, <>
          <div className="mb-2"><Button variant="outline" size="sm" className="h-6 w-full text-[10px]" aria-pressed={visibleKinds.size === allKinds.length} onClick={() => toggleSelection('kinds')}>{visibleKinds.size === allKinds.length ? 'Unselect all' : 'Select all'}</Button></div>
          {Object.entries(RESOURCE_CATEGORIES).map(([cat, { label, kinds }]) => (
            <div key={cat} className="mb-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
              <div className="space-y-1 mt-1">
                {kinds.map(kind => {
                  const config = RESOURCE_TYPE_CONFIG[kind as K8sKind];
                  if (!config) return null;
                  const Icon = config.icon;
                  return (
                    <label key={kind} className="flex items-center gap-2 cursor-pointer group">
                      <Checkbox
                        checked={visibleKinds.has(kind as K8sKind)}
                        onCheckedChange={() => toggleKind(kind as K8sKind)}
                        className="border-border"
                        style={{
                          '--tw-ring-color': config.color,
                        } as React.CSSProperties}
                      />
                      <Icon size={12} style={{ color: config.color }} />
                      <span className="text-xs text-foreground/80 transition-colors group-hover:text-foreground">
                        {config.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </>)}

        {section('Container metaphor matching', `${containerMetaphorDimensions}D`, <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Cosine dimensions</span>
            <span className="font-mono text-foreground">{containerMetaphorDimensions}</span>
          </div>
          <Slider
            min={16}
            max={256}
            step={16}
            value={[containerMetaphorDimensions]}
            onValueChange={value => setContainerMetaphorDimensions(typeof value === 'number' ? value : value[0] ?? 32)}
            aria-label="Container metaphor similarity dimensions"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Uses the highest cosine match at 70% or above. More dimensions reduce collisions and can improve precision.
          </p>
        </div>)}

        {section('Edge types', '5 options', <div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Communication</Label>
              <Switch checked={showCommunicationEdges} onCheckedChange={setShowCommunicationEdges} className="scale-75" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Ownership</Label>
              <Switch checked={showOwnershipEdges} onCheckedChange={setShowOwnershipEdges} className="scale-75" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Animate communication</Label>
              <Switch checked={animateCommunicationEdges} onCheckedChange={setAnimateCommunicationEdges} className="scale-75" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Cross-NS only</Label>
              <Switch checked={crossNamespaceOnly} onCheckedChange={setCrossNamespaceOnly} className="scale-75" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Include out-of-scope</Label>
              <Switch checked={includeOutOfScope} onCheckedChange={setIncludeOutOfScope} className="scale-75" />
            </div>
          </div>
        </div>)}

        {section('Namespace layout', `${namespaceLayoutCount} ${namespaceLayout}`, <div>
          <Select
            value={`${namespaceLayout}-${namespaceLayoutCount}`}
            onValueChange={value => {
              if (value) {
                const [layout, count] = value.split('-');
                setNamespaceLayout(layout as 'rows' | 'columns', Number(count));
              }
            }}
          >
            <SelectTrigger className="w-full h-8 text-xs bg-muted/60 border-border" aria-label="Namespace layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rows-1">Single row</SelectItem>
              <SelectItem value="rows-2">2 rows x automatic columns</SelectItem>
              <SelectItem value="rows-3">3 rows x automatic columns</SelectItem>
              <SelectItem value="columns-2">Automatic rows x 2 columns</SelectItem>
              <SelectItem value="columns-3">Automatic rows x 3 columns</SelectItem>
            </SelectContent>
          </Select>
        </div>)}

        {section('Confidence', `${minConfidence.length}/4`, <>
          <div className="mb-2"><Button variant="outline" size="sm" className="h-6 w-full text-[10px]" aria-pressed={minConfidence.length === Object.keys(CONFIDENCE_CONFIG).length} onClick={() => toggleSelection('confidence')}>{minConfidence.length === Object.keys(CONFIDENCE_CONFIG).length ? 'Unselect all' : 'Select all'}</Button></div>
          <div className="space-y-1.5">
            {(Object.entries(CONFIDENCE_CONFIG) as [ConfidenceTier, typeof CONFIDENCE_CONFIG[ConfidenceTier]][]).map(([tier, config]) => (
              <label key={tier} className="flex items-center gap-2 cursor-pointer group">
                <Checkbox
                  checked={minConfidence.includes(tier)}
                  onCheckedChange={() => toggleConfidence(tier)}
                  className="border-border"
                />
                <span className="w-2 h-2 rounded-full" style={{ background: config.color }} />
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  {config.label}
                </span>
              </label>
            ))}
          </div>
        </>)}

        {section('Network policy', networkPolicyFilter === 'all' ? 'all' : networkPolicyFilter, <div>
          <Select
            value={networkPolicyFilter}
            onValueChange={value => {
              if (value) setNetworkPolicyFilter(value as NetworkPolicyStatus | 'all');
            }}
          >
            <SelectTrigger className="w-full h-8 text-xs bg-muted/60 border-border" aria-label="Network policy status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="unrestricted">Unrestricted</SelectItem>
              <SelectItem value="allowed">Allowed</SelectItem>
              <SelectItem value="likely-blocked">Likely blocked</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>)}

        {/* Detection methods */}
        {section(
          'Detection methods',
          `${activeDetectors.size}/${DETECTOR_REGISTRY.length}`,
          <>
            <div className="mb-2">
              {(() => {
                const allOn = activeDetectors.size === DETECTOR_REGISTRY.length;
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-full text-[10px]"
                    aria-pressed={allOn}
                    onClick={() =>
                      setActiveDetectors(
                        allOn ? new Set() : new Set(DETECTOR_REGISTRY.map(d => d.name))
                      )
                    }
                  >
                    {allOn ? 'Disable all' : 'Enable all'}
                  </Button>
                );
              })()}
            </div>
            <div className="space-y-1">
              {DETECTOR_REGISTRY.map(detector => {
                const isActive = activeDetectors.has(detector.name);
                const edgeColor =
                  detector.edgeKind === 'ownership'
                    ? 'var(--muted-foreground)'
                    : 'var(--primary)';
                return (
                  <Tooltip key={detector.name}>
                    <TooltipTrigger render={
                      <label className="flex items-start gap-2 cursor-pointer group rounded-md px-1.5 py-1 hover:bg-accent/40 transition-colors">
                        <Checkbox
                          checked={isActive}
                          onCheckedChange={() => toggleDetector(detector.name)}
                          className="border-border mt-0.5 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate">
                              {detector.label}
                            </span>
                            <span
                              className="text-[9px] px-1 py-0 rounded shrink-0"
                              style={{
                                background: `${edgeColor}20`,
                                color: edgeColor,
                                border: `1px solid ${edgeColor}40`,
                              }}
                            >
                              {detector.edgeKind}
                            </span>
                          </div>
                        </div>
                      </label>
                    } />
                    <TooltipContent side="right" className="max-w-[200px] text-[11px]">
                      {detector.description}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function BadgeCount({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground" aria-label={`${count} active filters`}>
      {count}
    </span>
  );
}
