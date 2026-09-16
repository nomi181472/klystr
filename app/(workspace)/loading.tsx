import { LoadingIndicator } from '@/components/ui/loading-indicator';

export default function WorkspaceLoading() {
  return (
    <div className="grid h-full place-items-center bg-background/50 backdrop-blur-xs">
      <div className="flex flex-col items-center gap-4 text-center">
        <LoadingIndicator size="lg" label="Switching workspace…" className="flex-col gap-3" />
      </div>
    </div>
  );
}
