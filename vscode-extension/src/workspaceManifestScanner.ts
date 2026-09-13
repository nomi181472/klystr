import * as vscode from 'vscode';
import { createSession } from '../../lib/manifest-graph/store';
import { ingestFiles } from '../../lib/manifest-graph/engine';
import { fullGraph } from '../../lib/manifest-graph/serialize';
import type { UploadedManifestFile } from '../../lib/manifest-graph/types';

export interface WorkspaceScanResult {
  sessionId: string;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  conflictCount: number;
  files: UploadedManifestFile[];
  graph: ReturnType<typeof fullGraph>;
}

export class WorkspaceManifestScanner {
  private fileWatcher?: vscode.FileSystemWatcher;
  private onDidUpdateGraphEmitter = new vscode.EventEmitter<WorkspaceScanResult>();
  public readonly onDidUpdateGraph = this.onDidUpdateGraphEmitter.event;

  constructor() {
    this.setupWatcher();
  }

  private setupWatcher(): void {
    const config = vscode.workspace.getConfiguration('klystr');
    if (!config.get<boolean>('autoScanManifests', true)) return;

    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{yaml,yml}');

    const debounce = <T extends (...args: unknown[]) => void>(fn: T, ms = 500) => {
      let timer: NodeJS.Timeout;
      return (...args: Parameters<T>) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
    };

    const triggerRescan = debounce(() => {
      this.scanWorkspace().catch((err) => {
        console.error('[Klystr] Error auto-rescanning workspace manifests:', err);
      });
    }, 600);

    this.fileWatcher.onDidChange(triggerRescan);
    this.fileWatcher.onDidCreate(triggerRescan);
    this.fileWatcher.onDidDelete(triggerRescan);
  }

  public async scanWorkspace(): Promise<WorkspaceScanResult | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showInformationMessage('No open workspace to scan for Kubernetes manifests.');
      return null;
    }

    const yamlUris = await vscode.workspace.findFiles(
      '**/*.{yaml,yml}',
      '**/{node_modules,.git,.next,dist,artifacts,build,test-results}/**'
    );

    if (yamlUris.length === 0) {
      vscode.window.showInformationMessage('No Kubernetes YAML manifests found in the current workspace.');
      return null;
    }

    const files: UploadedManifestFile[] = [];

    for (const uri of yamlUris) {
      try {
        const fileBytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(fileBytes).toString('utf-8');

        // Quick check: does this look like a Kubernetes YAML file?
        if (/apiVersion:\s*\S+/i.test(content) && /kind:\s*\S+/i.test(content)) {
          files.push({
            relativePath: vscode.workspace.asRelativePath(uri),
            content,
          });
        }
      } catch (err) {
        console.warn(`[Klystr] Could not read file ${uri.fsPath}:`, err);
      }
    }

    if (files.length === 0) {
      vscode.window.showInformationMessage('Scanned YAML files, but none contained valid Kubernetes apiVersion/kind objects.');
      return null;
    }

    // Pass directly into the shared Klystr manifest engine!
    const session = createSession();
    let nodeCount = 0;
    let edgeCount = 0;
    let conflictCount = 0;

    ingestFiles(session, files, (event) => {
      if (event.type === 'indices-built') {
        nodeCount = event.nodeCount;
      } else if (event.type === 'edges-built') {
        edgeCount = event.edgeCount;
      } else if (event.type === 'done') {
        nodeCount = event.nodeCount;
        edgeCount = event.edgeCount;
        conflictCount = event.conflictCount;
      }
    });

    const graph = fullGraph(session);

    const result: WorkspaceScanResult = {
      sessionId: session.id,
      fileCount: files.length,
      nodeCount,
      edgeCount,
      conflictCount,
      files,
      graph,
    };

    this.onDidUpdateGraphEmitter.fire(result);
    return result;
  }

  public dispose(): void {
    this.fileWatcher?.dispose();
    this.onDidUpdateGraphEmitter.dispose();
  }
}
