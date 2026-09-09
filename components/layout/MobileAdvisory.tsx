'use client';

import { useState } from 'react';
import {
  Monitor,
  Smartphone,
  Cpu,
  Layers,
  ShieldCheck,
  Share2,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Terminal,
  Activity,
  BookOpen,
  Mail,
  RefreshCw,
  Info,
  ShieldAlert,
  Boxes,
  Network,
} from 'lucide-react';
import { KubeLogo } from '@/components/ui/kube-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface MobileAdvisoryProps {
  onRecheck: () => void;
  onBypass: () => void;
  detectedWidth: number;
}

export function MobileAdvisory({ onRecheck, onBypass, detectedWidth }: MobileAdvisoryProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'reasons' | 'features'>('reasons');
  const [showBypassConfirm, setShowBypassConfirm] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Klystr — Kubernetes Operations Workspace',
          text: 'Explore Klystr on desktop: Visual topology, RBAC inspection, container security, and dependency discovery.',
          url: window.location.href,
        });
      } catch {
        await handleCopyLink();
      }
    } else {
      await handleCopyLink();
    }
  };

  const emailSubject = encodeURIComponent('Klystr — Open on Desktop Workstation');
  const emailBody = encodeURIComponent(
    `Check out Klystr, the local-first Kubernetes operations workspace:\n\n${typeof window !== 'undefined' ? window.location.href : 'https://klystr.dev'}\n\nOpen this link on your desktop workstation or laptop.`
  );
  const emailHref = `mailto:?subject=${emailSubject}&body=${emailBody}`;

  const technicalReasons = [
    {
      icon: Layers,
      title: 'Spatial Canvas & High-Density Topology',
      category: 'Display & Architecture',
      description:
        'Klystr renders complex cluster topologies with dozens to hundreds of microservices, namespaces, ingress routes, and dependency edges. Graph navigation, spatial clustering, and multi-pane sidecar inspectors (YAML manifests, pod logs, metrics) require a wide canvas (minimum 1024px) for safe operational visibility.',
      impact: 'Mobile screens compress multi-cluster graphs into unreadable clusters, obscuring critical dependency paths.',
    },
    {
      icon: Cpu,
      title: 'Client-Side Layout Engine & Thermal Limits',
      category: 'Compute & Performance',
      description:
        'The topology engine computes hierarchical layouts locally using the Eclipse Layout Kernel (ELK) in WebWorkers, paired with real-time vector canvas rendering and live telemetry streams. This delivers instant, zero-server-hop responsiveness on desktop hardware.',
      impact: 'Running recursive layout solvers and live cluster telemetry on mobile silicon causes aggressive thermal throttling and high battery consumption.',
    },
    {
      icon: ShieldCheck,
      title: 'Operational Precision & Zero Accidental Mutations',
      category: 'Mission-Critical Safety',
      description:
        'Klystr is an active operational console providing RBAC inspection, live role bindings, token creation, and manifest analysis against production-grade clusters. Pointer hover precision and explicit keyboard confirmation flows are safety requirements.',
      impact: 'Coarse touchscreen taps introduce severe risks of accidental touches and unintended cluster mutations.',
    },
    {
      icon: Terminal,
      title: 'Local DevOps Toolchain Integration',
      category: 'Engineering Workflow',
      description:
        'Klystr is engineered to sit directly alongside your local terminal, kubectl contexts, port-forwarding proxies, private VPN tunnels, and local kubeconfig configurations (~/.kube/config) on your primary engineering workstation.',
      impact: 'Mobile sandboxes lack access to local cluster sockets and developer workstation networking.',
    },
  ];

  const features = [
    {
      icon: Network,
      name: 'Topology & Dependency Discovery',
      badge: 'Visual Graph',
      description:
        'Progressively discover cluster workloads, services, and configs. Traces real-time dependencies from ingress to pods with Node and namespace grouping.',
    },
    {
      icon: ShieldAlert,
      name: 'RBAC & Identity Intelligence',
      badge: 'Access Control',
      description:
        'Inspect ServiceAccounts, Roles, and ClusterRoles in one matrix. Explains who can do what and provides diagnostic guidance when access is denied.',
    },
    {
      icon: Boxes,
      name: 'Manifest Graph & Validation',
      badge: 'GitOps Ready',
      description:
        'Parse multi-document YAML manifests locally before deploy. Reveals inter-resource relationships and catches broken references in pre-production.',
    },
    {
      icon: ShieldCheck,
      name: 'Container Image Security',
      badge: 'Vulnerability Audit',
      description:
        'Analyze container images across running pods. Audits CVE vulnerabilities, base image layers, digest immutability, and compliance posture.',
    },
    {
      icon: Activity,
      name: 'Live Telemetry & Observability',
      badge: 'Real-time Metrics',
      description:
        'Live Pod metrics, network traffic flows, and operational health summaries streamed directly to your workspace.',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-between p-4 sm:p-6 select-none">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-accent/15 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-xl relative z-10 flex flex-col gap-6 my-auto pt-6 pb-8">
        {/* Header Branding */}
        <header className="flex flex-col items-center text-center gap-3">
          <div className="flex items-center gap-3">
            <KubeLogo size="md" />
            <div className="text-left">
              <span className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                Klystr
                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20">
                  Operations Workstation
                </span>
              </span>
              <p className="text-xs text-muted-foreground">See. Understand. Operate.</p>
            </div>
          </div>

          <div className="mt-2 space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Desktop Workstation Experience
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              Welcome! We’re thrilled you’re exploring Klystr. To guarantee operational safety, multi-pane cluster visibility, and high-performance topology computation, Klystr is engineered exclusively for desktop engineering environments.
            </p>
          </div>

          {/* Viewport Diagnostic Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/80 border border-border text-xs text-muted-foreground mt-1 shadow-xs">
            <Smartphone className="w-3.5 h-3.5 text-primary" />
            <span>
              Detected Viewport: <strong className="text-foreground">{detectedWidth}px</strong>
            </span>
            <span className="text-border">|</span>
            <Monitor className="w-3.5 h-3.5 text-primary" />
            <span>
              Required: <strong className="text-foreground">≥ 1024px</strong>
            </span>
          </div>
        </header>

        {/* Action Panel: Retain Audience / Workstation Transfer */}
        <Card className="border-primary/25 bg-card/90 backdrop-blur-sm shadow-md">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Share2 className="w-4 h-4 text-primary" />
              Open on Your Desktop Workstation
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Send this session directly to your laptop or workstation monitor to launch the full Kubernetes workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleCopyLink}
                className="w-full text-xs font-medium gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Link Copied!' : 'Copy Desktop Link'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNativeShare}
                className="w-full text-xs font-medium gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share / AirDrop
              </Button>
            </div>

            <a
              href={emailHref}
              className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              Send link to my email
            </a>
          </CardContent>
        </Card>

        {/* Tab switcher: Reasons vs Feature Preview */}
        <div className="flex rounded-lg bg-secondary/60 p-1 border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('reasons')}
            className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all ${
              activeTab === 'reasons'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Technical Architecture
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('features')}
            className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all ${
              activeTab === 'features'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Explore Capabilities
          </button>
        </div>

        {/* Tab 1: Technical & Critical Reasons */}
        {activeTab === 'reasons' && (
          <div className="flex flex-col gap-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-primary" />
              Why Klystr is Dedicated to Desktop
            </div>

            {technicalReasons.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Card key={idx} className="bg-card/70 border-border/80 text-left">
                  <CardContent className="p-3.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h2 className="text-xs font-semibold text-foreground leading-tight">{item.title}</h2>
                          <span className="text-[10px] text-muted-foreground font-mono">{item.category}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                    <div className="text-[11px] bg-secondary/50 rounded p-2 border border-border/60 text-secondary-foreground">
                      <span className="font-semibold text-primary">Operational constraint: </span>
                      {item.impact}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Tab 2: Feature Showcase (So visitors learn about Klystr) */}
        {activeTab === 'features' && (
          <div className="flex flex-col gap-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              What You Can Do on Desktop
            </div>

            {features.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <Card key={idx} className="bg-card/70 border-border/80 text-left">
                  <CardContent className="p-3.5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-accent/20 border border-border flex items-center justify-center text-foreground shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <h2 className="text-xs font-semibold text-foreground">{feat.name}</h2>
                      </div>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/80">
                        {feat.badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed pl-9">{feat.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Footer Actions & Documentation */}
        <footer className="flex flex-col gap-3 pt-2 text-center">
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={onRecheck}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-run Diagnostic Scan
            </button>
            <span className="text-border">•</span>
            <a
              href="https://github.com/nomi181472/klystr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              GitHub Repository
            </a>
          </div>

          {/* Discreet Developer Bypass */}
          <div className="pt-2 border-t border-border/40">
            {!showBypassConfirm ? (
              <button
                type="button"
                onClick={() => setShowBypassConfirm(true)}
                className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-4 transition-colors cursor-pointer"
              >
                Developer override: Preview compact workspace anyway
              </button>
            ) : (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 flex flex-col gap-2 text-left animate-in fade-in duration-200">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[11px] text-destructive-foreground leading-relaxed">
                    <strong>Experimental Mode Warning:</strong> Multi-pane graph layout and inspector sidecars are not optimized for mobile viewports. Layouts may overflow or clip.
                  </p>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBypassConfirm(false)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onBypass}
                    className="h-7 text-xs gap-1 cursor-pointer"
                  >
                    Proceed Anyway
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
