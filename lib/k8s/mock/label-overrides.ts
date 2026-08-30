const overrides = new Map<string, Record<string, string | null>>();

function key(kind: string, namespace: string | null, name: string) {
  return `${kind}/${namespace ?? '_cluster'}/${name}`;
}

export function setMockLabelOverride(kind: string, namespace: string | null, name: string, patch: Record<string, string | null>) {
  const id = key(kind, namespace, name);
  overrides.set(id, { ...(overrides.get(id) ?? {}), ...patch });
}

export function getMockLabelOverride(kind: string, namespace: string | null, name: string) {
  return overrides.get(key(kind, namespace, name));
}

export function applyMockLabelOverride(base: Record<string, string>, patch: Record<string, string | null>) {
  const labels = { ...base };
  for (const [label, value] of Object.entries(patch)) {
    if (value === null) delete labels[label]; else labels[label] = value;
  }
  return labels;
}
