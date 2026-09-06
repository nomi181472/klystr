import React, { useEffect, useState } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DoctorCheck {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  error?: string;
}

export function TelemetryDoctor({ onComplete }: { onComplete: (nodePort: number) => void }) {
  const { mode, ...settings } = useConnectionStore(s => s.settings);
  const onCompleteRef = React.useRef(onComplete);
  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const [checks, setChecks] = useState<DoctorCheck[]>([
    { id: 'mode', label: 'Live data selected from global', status: 'pending' },
    { id: 'cni', label: 'Cilium as CNI', status: 'pending' },
    { id: 'hubble', label: 'Hubble pod running', status: 'pending' },
    { id: 'nodeport', label: 'Node Port created & exported', status: 'pending' },
  ]);
  const [canExpose, setCanExpose] = useState(false);
  const [exposing, setExposing] = useState(false);

  const updateCheck = (id: string, updates: Partial<DoctorCheck>) => {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const connectionKey = `${mode}:${settings.clusterUrl}:${settings.connectionId}`;

  useEffect(() => {
    let active = true;

    async function runChecks() {
      // 1. Check Global Mode
      updateCheck('mode', { status: 'loading', error: undefined });
      await new Promise(resolve => setTimeout(resolve, 300));
      if (mode !== 'live') {
        if (active) updateCheck('mode', { status: 'error', error: 'Global connection mode is set to Mock data.' });
        return;
      }
      if (active) updateCheck('mode', { status: 'success' });

      // 2. Check CNI & 3. Hubble Pod via API
      if (active) {
        updateCheck('cni', { status: 'loading', error: undefined });
        updateCheck('hubble', { status: 'loading', error: undefined });
      }
      let networkStatus: Record<string, unknown> | null = null;
      try {
        const res = await fetch('/api/telemetry/doctor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, ...settings })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to run network checks');
        }
        networkStatus = await res.json();
      } catch (err: unknown) {
        if (active) {
          updateCheck('cni', { status: 'error', error: (err as Error).message });
          updateCheck('hubble', { status: 'error' });
        }
        return;
      }

      if (!active) return;

      if (!networkStatus) {
        if (active) updateCheck('cni', { status: 'error', error: 'Network status is empty' });
        return;
      }

      if (networkStatus.cni === 'cilium') {
        if (networkStatus.ciliumPhase === 'Running') {
          updateCheck('cni', { status: 'success', error: undefined });
        } else {
          updateCheck('cni', { status: 'error', error: `Cilium pod found but phase is ${networkStatus.ciliumPhase || 'Unknown'}.` });
          return;
        }
      } else {
        updateCheck('cni', { status: 'error', error: 'Cilium is not detected as the active CNI.' });
        return;
      }

      if (networkStatus.hubbleReady) {
        updateCheck('hubble', { status: 'success', error: undefined });
      } else {
        const guide = typeof networkStatus.hubbleEnableCommand === 'string' 
          ? networkStatus.hubbleEnableCommand 
          : 'Hubble Relay pod is not running.';
        updateCheck('hubble', { status: 'error', error: guide });
        return;
      }

      // Check if NodePort is already exported on the cluster
      if (typeof networkStatus.existingNodePort === 'number' && networkStatus.existingNodePort > 0) {
        const existingPort = networkStatus.existingNodePort;
        updateCheck('nodeport', { status: 'success', error: undefined });
        setTimeout(() => {
          if (active) onCompleteRef.current(existingPort);
        }, 500);
      } else {
        updateCheck('nodeport', { status: 'pending', error: undefined });
        if (active) setCanExpose(true);
      }
    }

    runChecks();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionKey]);

  const exposeNodePort = async () => {
    if (exposing) return;
    setExposing(true);
    updateCheck('nodeport', { status: 'loading', error: undefined });
    try {
      const res = await fetch('/api/telemetry/nodeport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ...settings })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to expose Hubble Relay NodePort');
      }
      const data = await res.json();
      if (data.nodePort) {
        updateCheck('nodeport', { status: 'success' });
        setTimeout(() => {
          onCompleteRef.current(data.nodePort);
        }, 600);
      } else {
        throw new Error('NodePort was not returned');
      }
    } catch (err: unknown) {
      updateCheck('nodeport', { status: 'error', error: (err as Error).message });
      setExposing(false);
    }
  };


  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-background/50 backdrop-blur-sm">
      <div className="flex flex-col gap-6 w-full max-w-md p-8 rounded-xl border border-border bg-card shadow-lg">
        <div className="flex flex-col gap-2 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Pre-flight Checks</h2>
          <p className="text-sm text-muted-foreground">Verifying telemetry prerequisites for live networking.</p>
        </div>

        <div className="flex flex-col gap-4 mt-2">
          {checks.map(check => (
            <div key={check.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                {check.status === 'pending' && <Circle className="h-5 w-5 text-muted-foreground/30" />}
                {check.status === 'loading' && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
                {check.status === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                {check.status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
                
                <span className={`text-sm font-medium ${check.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {check.label}
                </span>
              </div>
              {check.error && (
                <div className="ml-8 text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded-md border border-destructive/20">
                  {check.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {canExpose && checks.find(c => c.id === 'nodeport')?.status === 'pending' && (
          <div className="flex justify-center mt-4">
            <Button onClick={exposeNodePort} disabled={exposing}>
              {exposing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exposing NodePort...
                </>
              ) : (
                'Expose Hubble Relay'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
