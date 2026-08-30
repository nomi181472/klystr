export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SecurityStatus = 'pass' | 'warning' | 'fail' | 'unknown';

export interface SecurityControl { id: string; title: string; category: string; status: SecurityStatus; coverage: number; evidence: string; recommendation: string }
export interface SecurityAttackPath { id: string; title: string; severity: SecuritySeverity; summary: string; nodes: Array<{ label: string; type: string; detail: string }> }
export interface SecurityExposure { id: string; entrypoint: string; namespace: string; route: string; workload: string; exposure: string; policy: string; severity: SecuritySeverity }
export interface SecurityWorkload { id: string; workload: string; namespace: string; containers: number; risks: string[]; pss: 'restricted' | 'baseline' | 'privileged'; severity: SecuritySeverity }
export interface SecurityWarning { resource: string; message: string }
export interface SecuritySnapshot {
  source: 'live' | 'sample'; contextName: string; generatedAt: string; namespaces: number;
  controls: SecurityControl[]; attackPaths: SecurityAttackPath[]; networkExposures: SecurityExposure[];
  workloadRisks: SecurityWorkload[]; warnings: SecurityWarning[];
}
export interface SecurityTestResult { id: string; title: string; status: 'pass' | 'fail' | 'warning'; evidence: string }
export interface SecurityTestRun { contextName: string; executedAt: string; readOnly: true; results: SecurityTestResult[] }
