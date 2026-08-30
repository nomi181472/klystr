import { loadAll } from 'js-yaml';
import type {
  ContainerRef, EdgeRef, IngestEvent, ManifestGraphSession, ManifestObject,
  ResourceNode, StructuralRefCandidate, UploadedManifestFile,
} from './types';

type Emit = (event: IngestEvent) => void;
type NameIndex = Map<string, ResourceNode[]>;
type LabelEntry = { ownerKey: string; name: string; namespace: string | null; selectorKind: 'Pod' | 'Node' | 'Namespace'; labels: Record<string, string> };
type GroupKindIndex = Map<string, ResourceNode[]>;
type CustomScopeIndex = Map<string, 'Namespaced' | 'Cluster'>;

const CLUSTER_SCOPED_KINDS = new Set([
  'Namespace', 'Node', 'PersistentVolume', 'StorageClass', 'PriorityClass', 'RuntimeClass',
  'ClusterRole', 'ClusterRoleBinding', 'CustomResourceDefinition', 'IngressClass',
  'ValidatingWebhookConfiguration', 'MutatingWebhookConfiguration', 'APIService',
  'CSIDriver', 'CSINode', 'VolumeAttachment', 'CertificateSigningRequest',
  'FlowSchema', 'PriorityLevelConfiguration', 'PodSecurityPolicy', 'ComponentStatus',
]);

function customScopeKey(apiVersion: unknown, kind: unknown) {
  if (typeof apiVersion !== 'string' || typeof kind !== 'string' || !apiVersion.includes('/')) return undefined;
  return `${apiVersion.split('/')[0]}::${kind}`;
}

function effectiveNamespace(raw: ManifestObject, customScopes?: CustomScopeIndex) {
  if (CLUSTER_SCOPED_KINDS.has(String(raw.kind))) return null;
  if (typeof raw.metadata?.namespace === 'string' && raw.metadata.namespace) return raw.metadata.namespace;
  const scopeKey = customScopeKey(raw.apiVersion, raw.kind);
  const customScope = scopeKey ? customScopes?.get(scopeKey) : undefined;
  if (customScope === 'Cluster') return null;
  if (customScope === 'Namespaced') return 'default';
  const namespacedKnown = POD_TEMPLATE_PATHS[String(raw.kind)] || [
    'Service', 'Endpoints', 'EndpointSlice', 'Ingress', 'ConfigMap', 'Secret', 'ServiceAccount',
    'PersistentVolumeClaim', 'NetworkPolicy', 'PodDisruptionBudget', 'HorizontalPodAutoscaler',
    'Role', 'RoleBinding',
  ].includes(String(raw.kind));
  return namespacedKnown ? 'default' : null;
}

const POD_TEMPLATE_PATHS: Record<string, string[]> = {
  Pod: [],
  Deployment: ['spec', 'template'], StatefulSet: ['spec', 'template'],
  DaemonSet: ['spec', 'template'], ReplicaSet: ['spec', 'template'], Job: ['spec', 'template'],
  CronJob: ['spec', 'jobTemplate', 'spec', 'template'],
};

const CONTAINER_GROUPS = [
  ['containers', 'container'], ['initContainers', 'initContainer'],
  ['ephemeralContainers', 'ephemeralContainer'],
] as const;

function objectAt(value: unknown, path: string[]): ManifestObject | undefined {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as ManifestObject)[segment];
  }
  return current && typeof current === 'object' ? current as ManifestObject : undefined;
}

export function resourceKey(raw: ManifestObject, customScopes?: CustomScopeIndex) {
  const namespace = effectiveNamespace(raw, customScopes) ?? '<cluster-scoped>';
  return `${raw.apiVersion}::${raw.kind}::${namespace}::${raw.metadata?.name}`;
}

function canonicalize(node: ResourceNode) {
  const templatePath = POD_TEMPLATE_PATHS[node.kind];
  if (!templatePath) return;
  const template = templatePath.length ? objectAt(node.raw, templatePath) : node.raw;
  if (!template) return;
  const podSpec = templatePath.length ? template.spec : template.spec;
  if (!podSpec || typeof podSpec !== 'object') return;
  node.canonicalPodSpec = podSpec;
  node.canonicalPodLabels = templatePath.length ? (template.metadata?.labels ?? {}) : (node.raw.metadata?.labels ?? {});
  node.containers = CONTAINER_GROUPS.flatMap(([group, role]) =>
    (Array.isArray(podSpec[group]) ? podSpec[group] : []).map((spec: ManifestObject, index: number): ContainerRef => ({
      name: typeof spec.name === 'string' && spec.name ? spec.name : `${role}-${index}`,
      role,
      index,
      spec,
    })),
  );
}

function buildIndices(nodes: Iterable<ResourceNode>) {
  const names: NameIndex = new Map();
  const labels: LabelEntry[] = [];
  const groupKinds: GroupKindIndex = new Map();
  for (const node of nodes) {
    const existing = names.get(node.name) ?? [];
    existing.push(node);
    names.set(node.name, existing);
    const nodeLabels = node.canonicalPodLabels;
    if (nodeLabels) labels.push({ ownerKey: node.key, name: node.name, namespace: node.namespace, selectorKind: 'Pod', labels: nodeLabels });
    if (node.kind === 'Node' || node.kind === 'Namespace') labels.push({ ownerKey: node.key, name: node.name, namespace: node.namespace, selectorKind: node.kind, labels: node.raw.metadata?.labels ?? {} });
    const key = customScopeKey(node.apiVersion, node.kind);
    if (key) groupKinds.set(key, [...(groupKinds.get(key) ?? []), node]);
  }
  return { names, labels, groupKinds };
}

function selectByName(node: ResourceNode, names: NameIndex, name: unknown, targetKind?: string, namespace = node.namespace) {
  if (typeof name !== 'string' || !name) return [];
  const candidates = (names.get(name) ?? []).filter(candidate => !targetKind || candidate.kind === targetKind);
  const scoped = targetKind && CLUSTER_SCOPED_KINDS.has(targetKind)
    ? candidates.filter(candidate => candidate.namespace === null)
    : candidates.filter(candidate => candidate.namespace === namespace);
  return scoped
    .map(candidate => candidate.key);
}

function selectorMatches(selector: ManifestObject, labels: Record<string, string>) {
  const matchLabels = selector.matchLabels ?? selector;
  if (matchLabels && typeof matchLabels === 'object') {
    for (const [key, value] of Object.entries(matchLabels)) {
      if (key === 'matchExpressions') continue;
      if (labels[key] !== value) return false;
    }
  }
  for (const expression of selector.matchExpressions ?? []) {
    const present = Object.hasOwn(labels, expression.key);
    const values = Array.isArray(expression.values) ? expression.values : [];
    if (expression.operator === 'In' && (!present || !values.includes(labels[expression.key]))) return false;
    if (expression.operator === 'NotIn' && present && values.includes(labels[expression.key])) return false;
    if (expression.operator === 'Exists' && !present) return false;
    if (expression.operator === 'DoesNotExist' && present) return false;
  }
  return true;
}

function selectorIsEmpty(selector: ManifestObject) {
  const labels = selector.matchLabels && typeof selector.matchLabels === 'object' ? selector.matchLabels : selector;
  const labelKeys = Object.keys(labels ?? {}).filter(key => key !== 'matchExpressions');
  const expressions = Array.isArray(selector.matchExpressions) ? selector.matchExpressions : [];
  return labelKeys.length === 0 && expressions.length === 0;
}

function selectByLabels(entries: LabelEntry[], selector: ManifestObject, targetKind: LabelEntry['selectorKind'], namespace?: string | null, allowEmpty = false) {
  if (!allowEmpty && selectorIsEmpty(selector)) return [];
  return entries.filter(entry => entry.selectorKind === targetKind
    && (targetKind !== 'Pod' || namespace === undefined || entry.namespace === namespace)
    && selectorMatches(selector, entry.labels));
}

function selectorRef(fieldPath: string, selector: ManifestObject, candidates: LabelEntry[], targetKind: string): StructuralRefCandidate {
  const candidateNodeKeys = candidates.map(candidate => candidate.ownerKey);
  return { fieldPath, mode: 'bySelector', targetKind, candidateNodeKeys, resolved: candidateNodeKeys.length > 0, rawSelector: selector };
}

function structuralRef(node: ResourceNode, names: NameIndex, fieldPath: string, name: unknown, targetKind?: string, container?: ContainerRef, namespace = node.namespace): StructuralRefCandidate {
  const candidates = selectByName(node, names, name, targetKind, namespace);
  return {
    fieldPath, containerName: container?.name, containerRole: container?.role,
    mode: 'byName', targetKind, targetName: typeof name === 'string' ? name : undefined, candidateNodeKeys: candidates, resolved: candidates.length > 0,
  };
}

function extractStructural(node: ResourceNode, names: NameIndex, labels: LabelEntry[], groupKinds: GroupKindIndex) {
  const refs: StructuralRefCandidate[] = [];
  const add = (path: string, value: unknown, kind?: string, container?: ContainerRef, namespace = node.namespace) => {
    if (typeof value === 'string' && value) refs.push(structuralRef(node, names, path, value, kind, container, namespace));
  };
  const addSelector = (path: string, value: unknown, kind: LabelEntry['selectorKind'], namespace: string | null | undefined, allowEmpty = false) => {
    if (!value || typeof value !== 'object') return;
    const selector = value as ManifestObject;
    const candidates = selectByLabels(labels, selector, kind, namespace, allowEmpty).filter(candidate => candidate.ownerKey !== node.key);
    refs.push(selectorRef(path, selector, candidates, kind));
  };
  for (const [index, owner] of (node.raw.metadata?.ownerReferences ?? []).entries())
    add(`metadata.ownerReferences[${index}].name`, owner.name, owner.kind);

  const spec = node.canonicalPodSpec;
  if (spec) {
    add('canonicalPodSpec.serviceAccountName', spec.serviceAccountName, 'ServiceAccount');
    add('canonicalPodSpec.priorityClassName', spec.priorityClassName, 'PriorityClass');
    add('canonicalPodSpec.runtimeClassName', spec.runtimeClassName, 'RuntimeClass');
    for (const [i, secret] of (spec.imagePullSecrets ?? []).entries()) add(`canonicalPodSpec.imagePullSecrets[${i}].name`, secret.name, 'Secret');
    for (const [i, volume] of (spec.volumes ?? []).entries()) {
      const consumers = node.containers.filter(container => (container.spec.volumeMounts ?? []).some((mount: ManifestObject) => mount.name === volume.name));
      const addVolume = (path: string, value: unknown, kind: string) => consumers.length
        ? consumers.forEach(container => add(path, value, kind, container))
        : add(path, value, kind);
      addVolume(`canonicalPodSpec.volumes[${i}].configMap.name`, volume.configMap?.name, 'ConfigMap');
      addVolume(`canonicalPodSpec.volumes[${i}].secret.secretName`, volume.secret?.secretName, 'Secret');
      addVolume(`canonicalPodSpec.volumes[${i}].persistentVolumeClaim.claimName`, volume.persistentVolumeClaim?.claimName, 'PersistentVolumeClaim');
      for (const [j, source] of (volume.projected?.sources ?? []).entries()) {
        addVolume(`canonicalPodSpec.volumes[${i}].projected.sources[${j}].configMap.name`, source.configMap?.name, 'ConfigMap');
        addVolume(`canonicalPodSpec.volumes[${i}].projected.sources[${j}].secret.name`, source.secret?.name, 'Secret');
      }
    }
    for (const container of node.containers) {
      const base = `canonicalPodSpec.${container.role === 'container' ? 'containers' : `${container.role}s`}[${container.index}]`;
      for (const [i, from] of (container.spec.envFrom ?? []).entries()) {
        add(`${base}.envFrom[${i}].configMapRef.name`, from.configMapRef?.name, 'ConfigMap', container);
        add(`${base}.envFrom[${i}].secretRef.name`, from.secretRef?.name, 'Secret', container);
      }
      for (const [i, env] of (container.spec.env ?? []).entries()) {
        add(`${base}.env[${i}].valueFrom.configMapKeyRef.name`, env.valueFrom?.configMapKeyRef?.name, 'ConfigMap', container);
        add(`${base}.env[${i}].valueFrom.secretKeyRef.name`, env.valueFrom?.secretKeyRef?.name, 'Secret', container);
      }
    }
    addSelector('canonicalPodSpec.nodeSelector', spec.nodeSelector, 'Node', undefined);
    const nodeAffinity = spec.affinity?.nodeAffinity;
    const nodeTerms = [
      ...(nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms ?? []),
      ...(nodeAffinity?.preferredDuringSchedulingIgnoredDuringExecution ?? []).map((entry: ManifestObject) => entry.preference),
    ];
    for (const [index, term] of nodeTerms.entries()) {
      if (term?.matchExpressions?.length) addSelector(`canonicalPodSpec.affinity.nodeAffinity.nodeSelectorTerms[${index}]`, { matchExpressions: term.matchExpressions }, 'Node', undefined);
      else refs.push({ fieldPath: `canonicalPodSpec.affinity.nodeAffinity.nodeSelectorTerms[${index}]`, mode: 'bySelector', targetKind: 'Node', candidateNodeKeys: [], resolved: false, rawSelector: term });
    }
    for (const [index, toleration] of (spec.tolerations ?? []).entries()) refs.push({ fieldPath: `canonicalPodSpec.tolerations[${index}]`, mode: 'bySelector', targetKind: 'Node', candidateNodeKeys: [], resolved: false, rawSelector: toleration });
    for (const affinityKind of ['podAffinity', 'podAntiAffinity']) {
      const affinity = spec.affinity?.[affinityKind];
      const terms = [
        ...(affinity?.requiredDuringSchedulingIgnoredDuringExecution ?? []),
        ...(affinity?.preferredDuringSchedulingIgnoredDuringExecution ?? []).map((entry: ManifestObject) => entry.podAffinityTerm),
      ];
      for (const [index, term] of terms.entries()) {
        if (!term?.labelSelector || typeof term.labelSelector !== 'object') continue;
        const explicitNamespaces = Array.isArray(term.namespaces) ? term.namespaces.filter((value: unknown): value is string => typeof value === 'string') : [];
        const selectedNamespaces = term.namespaceSelector && typeof term.namespaceSelector === 'object'
          ? selectByLabels(labels, term.namespaceSelector, 'Namespace', undefined, true).map(entry => entry.name)
          : [];
        const namespaces = new Set([...explicitNamespaces, ...selectedNamespaces]);
        const candidates = selectByLabels(labels, term.labelSelector, 'Pod', undefined, true).filter(candidate => candidate.ownerKey !== node.key && (namespaces.size ? namespaces.has(candidate.namespace ?? '') : candidate.namespace === node.namespace));
        refs.push(selectorRef(`canonicalPodSpec.affinity.${affinityKind}[${index}].labelSelector`, term.labelSelector, candidates, 'Pod'));
      }
    }
  }

  if (node.kind === 'Service') addSelector('spec.selector', node.raw.spec?.selector, 'Pod', node.namespace);
  if (node.kind === 'PodDisruptionBudget') addSelector('spec.selector', node.raw.spec?.selector, 'Pod', node.namespace, node.apiVersion === 'policy/v1');
  if (node.kind === 'NetworkPolicy') {
    addSelector('spec.podSelector', node.raw.spec?.podSelector, 'Pod', node.namespace, true);
    const peerGroups = [
      ['ingress', 'from'], ['egress', 'to'],
    ] as const;
    for (const [ruleGroup, peerGroup] of peerGroups) for (const [ruleIndex, rule] of (node.raw.spec?.[ruleGroup] ?? []).entries()) for (const [peerIndex, peer] of (rule[peerGroup] ?? []).entries()) {
      if (!peer.podSelector && !peer.namespaceSelector) continue;
      const namespaceNames = peer.namespaceSelector && typeof peer.namespaceSelector === 'object'
        ? new Set(selectByLabels(labels, peer.namespaceSelector, 'Namespace', undefined, true).map(entry => entry.name))
        : new Set([node.namespace ?? '']);
      const podSelector = peer.podSelector && typeof peer.podSelector === 'object' ? peer.podSelector : {};
      const candidates = selectByLabels(labels, podSelector, 'Pod', undefined, true).filter(candidate => namespaceNames.has(candidate.namespace ?? ''));
      refs.push(selectorRef(`spec.${ruleGroup}[${ruleIndex}].${peerGroup}[${peerIndex}]`, peer, candidates, 'Pod'));
    }
  }
  if (node.kind === 'Ingress') {
    add('spec.ingressClassName', node.raw.spec?.ingressClassName, 'IngressClass');
    add('spec.defaultBackend.service.name', node.raw.spec?.defaultBackend?.service?.name, 'Service');
    add('spec.backend.serviceName', node.raw.spec?.backend?.serviceName, 'Service');
    for (const [i, rule] of (node.raw.spec?.rules ?? []).entries())
      for (const [j, path] of (rule.http?.paths ?? []).entries()) {
        add(`spec.rules[${i}].http.paths[${j}].backend.service.name`, path.backend?.service?.name, 'Service');
        add(`spec.rules[${i}].http.paths[${j}].backend.serviceName`, path.backend?.serviceName, 'Service');
      }
    for (const [i, tls] of (node.raw.spec?.tls ?? []).entries()) add(`spec.tls[${i}].secretName`, tls.secretName, 'Secret');
  }
  if (node.kind === 'PersistentVolumeClaim') {
    add('spec.volumeName', node.raw.spec?.volumeName, 'PersistentVolume');
    add('spec.storageClassName', node.raw.spec?.storageClassName, 'StorageClass');
  }
  if (node.kind === 'PersistentVolume') add('spec.storageClassName', node.raw.spec?.storageClassName, 'StorageClass');
  if (node.kind === 'HorizontalPodAutoscaler') add('spec.scaleTargetRef.name', node.raw.spec?.scaleTargetRef?.name, node.raw.spec?.scaleTargetRef?.kind);
  if (['RoleBinding', 'ClusterRoleBinding'].includes(node.kind)) {
    add('roleRef.name', node.raw.roleRef?.name, node.raw.roleRef?.kind);
    for (const [i, subject] of (node.raw.subjects ?? []).entries()) if (subject.kind === 'ServiceAccount') add(`subjects[${i}].name`, subject.name, 'ServiceAccount', undefined, typeof subject.namespace === 'string' && subject.namespace ? subject.namespace : node.namespace);
  }
  if (['ValidatingWebhookConfiguration', 'MutatingWebhookConfiguration'].includes(node.kind)) for (const [index, webhook] of (node.raw.webhooks ?? []).entries()) add(`webhooks[${index}].clientConfig.service.name`, webhook.clientConfig?.service?.name, 'Service', undefined, webhook.clientConfig?.service?.namespace ?? 'default');
  if (node.kind === 'CustomResourceDefinition') {
    const key = typeof node.raw.spec?.group === 'string' && typeof node.raw.spec?.names?.kind === 'string' ? `${node.raw.spec.group}::${node.raw.spec.names.kind}` : undefined;
    const candidateNodeKeys = key ? (groupKinds.get(key) ?? []).filter(candidate => candidate.key !== node.key).map(candidate => candidate.key) : [];
    refs.push({ fieldPath: 'spec.group/spec.names.kind', mode: 'byKindMatch', targetKind: node.raw.spec?.names?.kind, candidateNodeKeys, resolved: candidateNodeKeys.length > 0 });
  }
  node.structuralRefs = refs;
}

function normalizedTokens(value: string) {
  const tokens = new Set(value.split(/[^A-Za-z0-9_.-]+/).concat(value));
  for (const raw of [...tokens]) {
    const normalized = raw.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0]
      .replace(/:\d+$/, '').replace(/\.[a-z0-9-]+\.svc(?:\.cluster\.local)?$/i, '').replace(/\.svc(?:\.cluster\.local)?$/i, '');
    if (normalized) tokens.add(normalized);
  }
  return [...tokens];
}

function scanLiteral(node: ResourceNode, names: NameIndex, fieldPath: string, rawValue: string, container?: ContainerRef) {
  const matched = new Set<string>();
  for (const token of normalizedTokens(rawValue)) {
    if (names.has(token)) matched.add(token);
  }
  const matchedNames = [...matched].map(name => {
    const allCandidates = names.get(name) ?? [];
    const sameNamespace = allCandidates.filter(candidate => candidate.namespace === node.namespace);
    const candidates = sameNamespace.length ? sameNamespace : allCandidates.filter(candidate => candidate.namespace === null);
    const confidence: 'same-namespace' | 'cross-namespace' = sameNamespace.length ? 'same-namespace' : 'cross-namespace';
    return { name, candidateNodeKeys: candidates.map(candidate => candidate.key), confidence };
  });
  if (matchedNames.length) node.literalRefs.push({ fieldPath, containerName: container?.name, containerRole: container?.role, rawValue, matchedNames });
  return matchedNames.length;
}

function extractLiterals(node: ResourceNode, names: NameIndex) {
  let fields = 0, matches = 0;
  const scan = (path: string, value: unknown, container?: ContainerRef) => {
    if (typeof value !== 'string') return;
    fields += 1; matches += scanLiteral(node, names, path, value, container);
  };
  if (node.kind === 'ConfigMap') for (const group of ['data', 'binaryData']) for (const [key, value] of Object.entries(node.raw[group] ?? {})) scan(`${group}.${key}`, value);
  if (node.kind === 'Secret') {
    for (const [key, value] of Object.entries(node.raw.stringData ?? {})) {
      const before = node.literalRefs.length;
      scan(`stringData.${key}`, value);
      for (const ref of node.literalRefs.slice(before)) ref.rawValue = '<redacted secret value>';
    }
    for (const [key, value] of Object.entries(node.raw.data ?? {})) {
      try {
        const decoded = Buffer.from(String(value), 'base64').toString('utf8');
        const before = node.literalRefs.length;
        scan(`data.${key}`, decoded);
        for (const ref of node.literalRefs.slice(before)) ref.rawValue = '<redacted secret value>';
      } catch { /* malformed secrets stay non-fatal */ }
    }
  }
  for (const container of node.containers) {
    const group = container.role === 'container' ? 'containers' : `${container.role}s`;
    for (const [i, env] of (container.spec.env ?? []).entries()) scan(`canonicalPodSpec.${group}[${container.index}].env[${i}].value`, env.value, container);
  }
  return { fields, matches };
}

function buildEdges(session: ManifestGraphSession) {
  let count = 0;
  for (const node of session.nodeStore.values()) {
    const refs = [
      ...node.structuralRefs.flatMap(ref => ref.candidateNodeKeys.map(to => ({ to, type: `structural:${ref.mode}`, meta: { fieldPath: ref.fieldPath, containerName: ref.containerName, containerRole: ref.containerRole, targetKind: ref.targetKind } }))),
      ...node.literalRefs.flatMap(ref => ref.matchedNames.flatMap(match => match.candidateNodeKeys.map(to => ({ to, type: 'literal:name', meta: { fieldPath: ref.fieldPath, containerName: ref.containerName, containerRole: ref.containerRole, rawValue: ref.rawValue, confidence: match.confidence } })))),
    ] satisfies EdgeRef[];
    session.adjacencyOut.set(node.key, refs);
    for (const edge of refs) {
      session.adjacencyIn.set(edge.to, [...(session.adjacencyIn.get(edge.to) ?? []), { ...edge, to: node.key }]);
      count += 1;
    }
  }
  return count;
}

function expandDocument(value: unknown): ManifestObject[] {
  if (Array.isArray(value)) return value.flatMap(expandDocument);
  if (!value || typeof value !== 'object') return [];
  const object = value as ManifestObject;
  if ((object.kind === 'List' || String(object.kind ?? '').endsWith('List')) && Array.isArray(object.items)) return object.items.flatMap(expandDocument);
  return [object];
}

function buildCustomScopes(objects: ManifestObject[]) {
  const scopes: CustomScopeIndex = new Map();
  for (const object of objects) {
    if (object.kind !== 'CustomResourceDefinition') continue;
    const group = object.spec?.group;
    const kind = object.spec?.names?.kind;
    const scope = object.spec?.scope;
    if (typeof group === 'string' && typeof kind === 'string' && (scope === 'Namespaced' || scope === 'Cluster')) scopes.set(`${group}::${kind}`, scope);
  }
  return scopes;
}

export function ingestFiles(session: ManifestGraphSession, files: UploadedManifestFile[], emit: Emit) {
  const ordered = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const parsedObjects: { object: ManifestObject; file: UploadedManifestFile }[] = [];
  let ingestOrder = 0;
  ordered.forEach((file, fileIndex) => {
    emit({ type: 'progress', filePath: file.relativePath, index: fileIndex + 1, total: ordered.length });
    try {
      const documents: unknown[] = [];
      try {
        loadAll(file.content, document => documents.push(document));
      } catch (error) {
        if (!(error instanceof Error) || !/duplicated mapping key/i.test(error.message)) throw error;
        documents.length = 0;
        loadAll(file.content, document => documents.push(document), { json: true });
        emit({ type: 'file-warning', filePath: file.relativePath, message: 'Duplicate YAML keys found; Kubernetes-compatible last value was used.' });
      }
      for (const raw of documents) for (const object of expandDocument(raw)) if (object.apiVersion && object.kind && object.metadata?.name) parsedObjects.push({ object, file });
    } catch (error) {
      emit({ type: 'file-error', filePath: file.relativePath, message: error instanceof Error ? error.message : 'Unable to parse manifest' });
    }
  });
  const customScopes = buildCustomScopes(parsedObjects.map(item => item.object));
  for (const { object, file } of parsedObjects) {
    const key = resourceKey(object, customScopes);
    const incoming: ResourceNode = {
      key, apiVersion: object.apiVersion, kind: object.kind,
      namespace: effectiveNamespace(object, customScopes), name: object.metadata.name, raw: object,
      source: { filePath: file.relativePath, chartName: file.chartName, lastModified: file.lastModified, ingestOrder: ingestOrder++ },
      literalRefs: [], structuralRefs: [], containers: [],
    };
    const previous = session.nodeStore.get(key);
    if (!previous) {
      session.nodeStore.set(key, incoming);
      emit({ type: 'parsed', key, kind: incoming.kind, name: incoming.name, namespace: incoming.namespace });
      continue;
    }
    const useTimestamp = previous.source.lastModified != null && incoming.source.lastModified != null;
    const incomingWins = useTimestamp ? incoming.source.lastModified! >= previous.source.lastModified! : true;
    if (incomingWins) session.nodeStore.set(key, incoming);
    const conflict = { key, previous: previous.source, incoming: incoming.source, resolvedTo: incomingWins ? 'incoming' as const : 'previous' as const, detectedAt: Date.now() };
    session.conflicts.set(key, [...(session.conflicts.get(key) ?? []), conflict]);
    emit({ type: 'conflict', key, previousSource: previous.source.filePath, incomingSource: incoming.source.filePath, resolvedTo: conflict.resolvedTo });
  }
  for (const node of session.nodeStore.values()) canonicalize(node);
  const { names, labels, groupKinds } = buildIndices(session.nodeStore.values());
  emit({ type: 'indices-built', nodeCount: session.nodeStore.size });
  let structuralMatches = 0;
  for (const node of session.nodeStore.values()) { extractStructural(node, names, labels, groupKinds); structuralMatches += node.structuralRefs.length; }
  emit({ type: 'structural-refs-extracted', ruleMatches: structuralMatches });
  let fieldsScanned = 0, matchesFound = 0;
  for (const node of session.nodeStore.values()) { const result = extractLiterals(node, names); fieldsScanned += result.fields; matchesFound += result.matches; }
  emit({ type: 'literal-refs-scanned', fieldsScanned, matchesFound });
  const edgeCount = buildEdges(session);
  emit({ type: 'edges-built', edgeCount });
  const conflictCount = [...session.conflicts.values()].reduce((sum, records) => sum + records.length, 0);
  emit({ type: 'done', sessionId: session.id, nodeCount: session.nodeStore.size, edgeCount, conflictCount });
}
