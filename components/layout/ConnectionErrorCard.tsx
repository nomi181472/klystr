'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Lightbulb,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ConnectionErrorInfo, ConnectionSettings } from '@/lib/types';

interface ConnectionErrorCardProps {
  error: ConnectionErrorInfo;
  draftSettings: ConnectionSettings;
  onUpdateDraftSettings: (patch: Partial<ConnectionSettings>) => void;
  onRetryWithPatch?: (patch: Partial<ConnectionSettings>) => void;
  isConnecting?: boolean;
}

const CATEGORY_LABELS: Record<string, { label: string; badgeClass: string }> = {
  network: {
    label: 'Network / Unreachable',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  tls: {
    label: 'TLS Certificate Error',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  unauthorized: {
    label: 'Authentication Failed (401)',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  forbidden: {
    label: 'Permission Denied (403)',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  timeout: {
    label: 'Connection Timeout (504)',
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  'config-error': {
    label: 'Configuration Error (400)',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  'invalid-request': {
    label: 'Invalid Request (400)',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  unknown: {
    label: 'Connection Error',
    badgeClass: 'bg-destructive/20 text-destructive-foreground border-destructive/40',
  },
};

export function ConnectionErrorCard({
  error,
  draftSettings,
  onUpdateDraftSettings,
  onRetryWithPatch,
  isConnecting = false,
}: ConnectionErrorCardProps) {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const categoryMeta = CATEGORY_LABELS[error.category] ?? CATEGORY_LABELS.unknown;

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const copyFullReport = () => {
    const report = [
      `[Kubernetes Connection Error Report]`,
      `Category: ${error.category}`,
      `Message: ${error.message}`,
      error.targetEndpoint ? `Target Endpoint: ${error.targetEndpoint}` : null,
      error.environment ? `Environment: ${error.environment}` : null,
      error.configSource ? `Config Source: ${error.configSource}` : null,
      error.detail ? `Detail: ${error.detail}` : null,
      error.suggestions && error.suggestions.length > 0
        ? `Suggestions:\n${error.suggestions.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
    copyToClipboard(report, 'full-report');
  };

  // Helper to render suggestion line with inline code blocks
  const renderSuggestionText = (text: string) => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        const cmd = part.slice(1, -1);
        const copyId = `cmd-${index}-${cmd}`;
        const isCopied = copiedText === copyId;
        return (
          <span key={index} className="inline-flex items-center gap-1 mx-1 my-0.5 align-middle">
            <code className="rounded bg-background/90 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground border border-border/80">
              {cmd}
            </code>
            <button
              type="button"
              onClick={() => copyToClipboard(cmd, copyId)}
              title="Copy command"
              className="inline-flex p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {isCopied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            </button>
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-destructive/35 bg-destructive/10 p-3.5 text-xs text-foreground shadow-xs animate-in fade-in-50 duration-200"
    >
      {/* Header with Icon, Category Badge & Copy Report */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-destructive text-red-400" />
          <Badge variant="outline" className={`text-[10px] font-medium tracking-wide ${categoryMeta.badgeClass}`}>
            {categoryMeta.label}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyFullReport}
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
        >
          {copiedText === 'full-report' ? (
            <>
              <Check size={11} className="text-emerald-400" />
              <span className="text-emerald-400">Copied diagnostics</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy diagnostics</span>
            </>
          )}
        </Button>
      </div>

      {/* Primary Error Message */}
      <div className="text-[12px] font-medium leading-relaxed text-destructive-foreground break-words">
        {error.message}
      </div>

      {/* Endpoint and Context Tags */}
      {(error.targetEndpoint || error.configSource || error.environment) && (
        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-muted-foreground pt-0.5">
          {error.targetEndpoint && (
            <span className="rounded bg-background/60 border border-border/70 px-2 py-0.5 break-all">
              <span className="text-foreground/70 font-sans font-semibold mr-1">Endpoint:</span>
              {error.targetEndpoint}
            </span>
          )}
          {error.configSource && (
            <span className="rounded bg-background/60 border border-border/70 px-2 py-0.5">
              <span className="text-foreground/70 font-sans font-semibold mr-1">Source:</span>
              {error.configSource}
            </span>
          )}
          {error.environment && (
            <span className="rounded bg-background/60 border border-border/70 px-2 py-0.5">
              <span className="text-foreground/70 font-sans font-semibold mr-1">Env:</span>
              {error.environment}
            </span>
          )}
        </div>
      )}

      {/* Suggestions Section */}
      {error.suggestions && error.suggestions.length > 0 && (
        <div className="rounded-md border border-border/70 bg-card/75 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <Lightbulb size={13} className="text-amber-400 shrink-0" />
            <span>Troubleshooting Suggestions:</span>
          </div>
          <ul className="space-y-1.5 pl-1 text-[11px] text-muted-foreground leading-relaxed">
            {error.suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start gap-1.5">
                <span className="text-muted-foreground/60 select-none">•</span>
                <span className="flex-1 break-words">{renderSuggestionText(suggestion)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contextual Quick Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {error.category === 'tls' && !draftSettings.skipTlsVerify && onRetryWithPatch && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isConnecting}
            onClick={() => {
              onUpdateDraftSettings({ skipTlsVerify: true });
              onRetryWithPatch({ skipTlsVerify: true });
            }}
            className="h-7 text-xs bg-card hover:bg-muted border-rose-500/40 text-rose-300 gap-1.5"
          >
            <ShieldAlert size={12} />
            <span>Enable &quot;Skip TLS verification&quot; & Retry</span>
          </Button>
        )}

        {error.category === 'network' &&
          draftSettings.environment !== 'microk8s' &&
          /microk8s/i.test(`${error.message} ${error.detail ?? ''}`) &&
          onRetryWithPatch && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isConnecting}
              onClick={() => {
                onUpdateDraftSettings({ environment: 'microk8s', clusterUrl: '', token: '' });
                onRetryWithPatch({ environment: 'microk8s', clusterUrl: '', token: '' });
              }}
              className="h-7 text-xs bg-card hover:bg-muted border-amber-500/40 text-amber-300 gap-1.5"
            >
              <RotateCcw size={12} />
              <span>Switch to MicroK8s Environment & Retry</span>
            </Button>
          )}
      </div>

      {/* Collapsible Technical Details */}
      {error.detail && error.detail !== error.message && (
        <div className="border-t border-destructive/20 pt-2">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showTechnicalDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Technical Details</span>
          </button>
          {showTechnicalDetails && (
            <div className="mt-1.5 max-h-32 overflow-y-auto rounded bg-background/90 p-2 font-mono text-[10px] text-muted-foreground border border-border break-all leading-tight">
              {error.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
