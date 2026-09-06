'use client';

import React, { useState } from 'react';
import { Activity, Network } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { useConnectionStore } from '@/stores/connection-store';
import { LiveNetworkingView } from './LiveNetworkingView';
import { TelemetryDoctor } from './TelemetryDoctor';

// ── Root workspace — matches SecurityWorkspace structure exactly ─────────────

export default function TelemetryWorkspace() {
  const { mode, ...settings } = useConnectionStore(s => s.settings);
  const [nodePort, setNodePort] = useState<number | null>(null);

  const handleComplete = React.useCallback((port: number) => {
    setNodePort(port);
  }, []);

  const closeNodePort = async () => {
    try {
      const res = await fetch('/api/telemetry/nodeport', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ...settings })
      });
      if (res.ok) {
        setNodePort(null);
      }
    } catch (err) {
      console.error('Failed to close NodePort', err);
    }
  };

  return (
    <div className="telemetry-workspace flex h-full min-h-0 flex-col bg-background">
      {/* Page header */}
      <div className="shrink-0 border-b border-border bg-card p-4 sm:p-5 flex justify-between items-center">
        <PageHeader
          title="Telemetry"
          description="Live Kubernetes network observability and TCP-level traffic analysis."
          icon={<Activity />}
        />
        
        {/* NodePort Controls */}
        <div className="flex items-center gap-3">
          {nodePort ? (
            <>
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">Hubble Relay NodePort</span>
                <span className="text-sm font-medium text-primary">{nodePort}</span>
              </div>
              <button
                onClick={closeNodePort}
                className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
              >
                Close Port
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <Tabs defaultValue="live-networking" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto border-b border-border px-4 sm:px-5">
          <TabsList className="h-10 w-max bg-transparent p-0 gap-1">
            <TabsTrigger value="live-networking">
              <Network size={14} className="mr-1.5" />
              Live Networking
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab content */}
        <TabsContent value="live-networking" className="m-0 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col relative">
          {mode === 'mock' || nodePort ? (
            <LiveNetworkingView />
          ) : (
            <TelemetryDoctor onComplete={handleComplete} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
