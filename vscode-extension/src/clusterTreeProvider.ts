import * as vscode from 'vscode';
import * as k8s from '@kubernetes/client-node';

export class ClusterTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly contextName: string,
    public readonly isActive: boolean,
    public readonly clusterName?: string,
    public readonly namespace?: string,
    public readonly user?: string
  ) {
    super(
      label,
      vscode.TreeItemCollapsibleState.None
    );

    this.tooltip = `Context: ${contextName}\nCluster: ${clusterName ?? 'default'}\nNamespace: ${namespace ?? 'default'}\nUser: ${user ?? 'default'}`;
    this.description = isActive ? '(Active)' : '';
    this.iconPath = new vscode.ThemeIcon(isActive ? 'check' : 'server-process');
    this.contextValue = 'contextItem';

    this.command = {
      command: 'klystr.switchContext',
      title: 'Switch Context',
      arguments: [contextName],
    };
  }
}

export class ClusterTreeProvider implements vscode.TreeDataProvider<ClusterTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ClusterTreeItem | undefined | void> =
    new vscode.EventEmitter<ClusterTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<ClusterTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private kubeConfig: k8s.KubeConfig;
  private customKubeconfigPath?: string;
  private customKubeconfigContent?: string;

  constructor() {
    this.kubeConfig = new k8s.KubeConfig();
    this.loadKubeConfig();
  }

  public setKubeconfig(filePath?: string, content?: string): void {
    this.customKubeconfigPath = filePath;
    this.customKubeconfigContent = content;
    this.refresh();
  }

  public getKubeconfigSource(): string {
    if (this.customKubeconfigPath) return this.customKubeconfigPath;
    if (this.customKubeconfigContent) return 'Uploaded kubeconfig';
    return '~/.kube/config';
  }

  public loadKubeConfig(): void {
    try {
      if (this.customKubeconfigContent) {
        this.kubeConfig.loadFromString(this.customKubeconfigContent);
      } else if (this.customKubeconfigPath) {
        this.kubeConfig.loadFromFile(this.customKubeconfigPath);
      } else {
        this.kubeConfig.loadFromDefault();
      }
    } catch (err) {
      console.warn('[Klystr] Could not load kubeconfig:', err);
    }
  }

  public refresh(): void {
    this.loadKubeConfig();
    this._onDidChangeTreeData.fire();
  }

  public getCurrentContext(): string | null {
    try {
      return this.kubeConfig.getCurrentContext();
    } catch {
      return null;
    }
  }

  public getContexts(): k8s.Context[] {
    return this.kubeConfig.getContexts();
  }

  public getTreeItem(element: ClusterTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): Thenable<ClusterTreeItem[]> {
    const currentContext = this.getCurrentContext();
    const contexts = this.getContexts();

    if (!contexts || contexts.length === 0) {
      const item = new ClusterTreeItem(
        'No kubeconfig contexts found',
        '',
        false
      );
      item.iconPath = new vscode.ThemeIcon('warning');
      return Promise.resolve([item]);
    }

    const items = contexts.map((ctx) => {
      const isActive = ctx.name === currentContext;
      return new ClusterTreeItem(
        ctx.name,
        ctx.name,
        isActive,
        ctx.cluster,
        ctx.namespace,
        ctx.user
      );
    });

    // Sort active context to the top
    items.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0));

    return Promise.resolve(items);
  }
}

export class QuickActionItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly commandId: string,
    public readonly iconName: string,
    public readonly tooltipText?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.tooltip = tooltipText ?? label;
    this.command = {
      command: commandId,
      title: label,
    };
  }
}

export class QuickActionsProvider implements vscode.TreeDataProvider<QuickActionItem> {
  getTreeItem(element: QuickActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<QuickActionItem[]> {
    return Promise.resolve([
      new QuickActionItem(
        'Open Kubernetes Workspace',
        'klystr.openDashboard',
        'globe',
        'Launch interactive Topology, RBAC, and Manifest graph'
      ),
      new QuickActionItem(
        'Open Manifest Visibility',
        'klystr.openManifests',
        'type-hierarchy',
        'Inspect declared Kubernetes manifests, dependency graph & static findings'
      ),
      new QuickActionItem(
        'Scan Workspace Manifests',
        'klystr.scanWorkspaceManifests',
        'files',
        'Scan open repository for Kubernetes YAMLs & analyze dependencies'
      ),
      new QuickActionItem(
        'Select Kubeconfig File...',
        'klystr.selectKubeconfig',
        'folder-opened',
        'Load custom Kubernetes kubeconfig file (.yaml, .yml, .config)'
      ),
      new QuickActionItem(
        'Refresh Clusters & Contexts',
        'klystr.refreshClusters',
        'refresh',
        'Reload kubeconfig contexts'
      ),
    ]);
  }
}
