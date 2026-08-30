'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useUIStore } from '@/stores/ui-store';
import { useGraphStore } from '@/stores/graph-store';
import { getResourceConfig } from '@/config/resource-types';
import { searchGraphNodes } from '@/lib/graph/neighborhood';
import type { GraphData } from '@/lib/types';

interface CommandPaletteProps {
  graphData: GraphData | null;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function CommandPalette({ graphData }: CommandPaletteProps) {
  const open = useUIStore(s => s.isCommandPaletteOpen);
  const setOpen = useUIStore(s => s.setCommandPaletteOpen);
  const jumpToNode = useGraphStore(s => s.jumpToNode);
  const toggleIsolate = useGraphStore(s => s.toggleIsolate);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const isolateNodeId = useGraphStore(s => s.isolateNodeId);
  const clearInvestigation = useGraphStore(s => s.clearInvestigation);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const metaK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (metaK || slash) {
        if (slash && isTypingTarget(event.target)) return;
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (event.key === 'Escape' && !open) {
        if (isolateNodeId || selectedNodeId) {
          event.preventDefault();
          clearInvestigation();
        }
        return;
      }

      if (open || isTypingTarget(event.target)) return;

      if ((event.key === 'f' || event.key === 'i') && selectedNodeId) {
        event.preventDefault();
        toggleIsolate(selectedNodeId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen, selectedNodeId, isolateNodeId, toggleIsolate, clearInvestigation]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setQuery('');
    setOpen(isOpen);
  };

  const results = useMemo(
    () => (graphData ? searchGraphNodes(graphData.nodes, query) : []),
    [graphData, query],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Jump to resource"
      description="Search by name, kind, namespace, label, or IP"
    >
      <CommandInput
        placeholder="Search name, kind, namespace, label, IP…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matching resources</CommandEmpty>
        <CommandGroup heading="Resources">
          {results.map(node => {
            const config = getResourceConfig(node.kind);
            const Icon = config.icon;
            return (
              <CommandItem
                key={node.id}
                value={`${node.id} ${node.name} ${node.kind} ${node.namespace ?? ''} ${node.metadata.ip ?? ''}`}
                onSelect={() => {
                  jumpToNode(node.id);
                  setOpen(false);
                }}
              >
                <Icon size={14} style={{ color: config.color }} />
                <span className="truncate">{node.name}</span>
                <span className="ml-auto truncate text-[11px] text-muted-foreground">
                  {node.kind}
                  {node.namespace ? ` · ${node.namespace}` : ''}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
