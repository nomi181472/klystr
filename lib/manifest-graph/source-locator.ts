/**
 * Source locator utility for discovering exact 1-indexed line and column numbers
 * for Kubernetes resources and relationship edges in YAML/JSON manifest content.
 */

export interface SourceLocation {
  line: number;
  column: number;
}

export interface MinimalResourceNode {
  kind: string;
  name: string;
  source?: { filePath: string; line?: number };
}

export interface MinimalEdge {
  type: string;
  meta?: Record<string, unknown>;
  from?: string;
  to?: string;
}

/**
 * Splits YAML content into document chunks separated by `---` lines.
 */
export function getDocumentRanges(content: string): Array<{ startIndex: number; endIndex: number; startLine: number; endLine: number }> {
  const lines = content.split(/\r?\n/);
  const ranges: Array<{ startIndex: number; endIndex: number; startLine: number; endLine: number }> = [];

  let currentStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '---' || trimmed.startsWith('--- ')) {
      if (i > 0 && i >= currentStart - 1) {
        ranges.push({
          startIndex: currentStart - 1,
          endIndex: i - 1,
          startLine: currentStart,
          endLine: i,
        });
      }
      currentStart = i + 2; // Line after '---'
    }
  }

  if (currentStart <= lines.length) {
    ranges.push({
      startIndex: currentStart - 1,
      endIndex: lines.length - 1,
      startLine: currentStart,
      endLine: lines.length,
    });
  }

  return ranges;
}

/**
 * Locates the definition line of a Kubernetes resource (by kind and metadata.name) in a YAML or JSON file.
 * Returns 1-indexed line and column.
 */
export function locateResourceInYaml(
  content: string,
  kind: string,
  name: string
): SourceLocation {
  if (!content) return { line: 1, column: 1 };

  const lines = content.split(/\r?\n/);
  const ranges = getDocumentRanges(content);

  const cleanKind = kind.trim();
  const cleanName = name.trim();

  // Escape special regex characters
  const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const kindRegex = new RegExp(`^\\s*kind:\\s*["']?${escapeRegex(cleanKind)}["']?\\s*$`, 'i');
  const nameRegex = new RegExp(`^\\s*name:\\s*["']?${escapeRegex(cleanName)}["']?\\s*$`, 'i');

  for (const range of ranges) {
    let hasKind = false;
    let kindLine = range.startLine;
    let nameLine: number | null = null;

    for (let i = range.startIndex; i <= range.endIndex; i++) {
      const lineText = lines[i];

      if (kindRegex.test(lineText)) {
        hasKind = true;
        kindLine = i + 1;
      }

      if (nameRegex.test(lineText)) {
        nameLine = i + 1;
      }
    }

    if (hasKind && nameLine !== null) {
      // Prioritize the kind line or start of object
      return { line: kindLine, column: 1 };
    }
  }

  // Fallback 1: match just kind and name anywhere in file
  let matchedKindLine = 1;
  for (let i = 0; i < lines.length; i++) {
    if (kindRegex.test(lines[i])) {
      matchedKindLine = i + 1;
      break;
    }
  }

  return { line: matchedKindLine, column: 1 };
}

/**
 * Locates the specific line in the source YAML where an edge connection/reference appears.
 * For example:
 * - A reference to a ConfigMap or Secret name (e.g. `name: shared-config`)
 * - An Ingress service backend (e.g. `name: web-service`)
 * - A Service selector (e.g. `app: web` or `selector:`)
 * - A Volume claim (e.g. `claimName: data-pvc`)
 */
export function locateEdgeInYaml(
  content: string,
  edge: MinimalEdge,
  sourceNode?: MinimalResourceNode,
  targetNode?: MinimalResourceNode
): SourceLocation {
  if (!content) return { line: 1, column: 1 };

  const lines = content.split(/\r?\n/);
  const ranges = getDocumentRanges(content);

  // 1. Determine the document range for sourceNode if provided
  let searchStart = 0;
  let searchEnd = lines.length - 1;

  if (sourceNode) {
    const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const kindRegex = new RegExp(`^\\s*kind:\\s*["']?${escapeRegex(sourceNode.kind)}["']?\\s*$`, 'i');
    const nameRegex = new RegExp(`^\\s*name:\\s*["']?${escapeRegex(sourceNode.name)}["']?\\s*$`, 'i');

    for (const range of ranges) {
      let hasKind = false;
      let hasName = false;
      for (let i = range.startIndex; i <= range.endIndex; i++) {
        if (kindRegex.test(lines[i])) hasKind = true;
        if (nameRegex.test(lines[i])) hasName = true;
      }
      if (hasKind && hasName) {
        searchStart = range.startIndex;
        searchEnd = range.endIndex;
        break;
      }
    }
  }

  const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const targetName =
    (typeof edge.meta?.targetName === 'string' && edge.meta.targetName) ||
    targetNode?.name;

  // 2. Strategy A: Direct match on targetName (e.g. 'name: targetName', 'secretName: targetName', 'claimName: targetName')
  if (targetName) {
    const escapedTarget = escapeRegex(targetName.trim());
    const patterns = [
      new RegExp(`(?:name|secretName|configMapName|serviceName|claimName):\\s*["']?${escapedTarget}["']?\\b`, 'i'),
      new RegExp(`:\\s*["']?${escapedTarget}["']?\\s*$`, 'i'),
      new RegExp(`\\b${escapedTarget}\\b`),
    ];

    for (const pattern of patterns) {
      for (let i = searchStart; i <= searchEnd; i++) {
        // Skip metadata.name of the source itself
        const lineText = lines[i];
        if (sourceNode && lineText.includes(`name: ${sourceNode.name}`) && i - searchStart < 15) {
          continue;
        }
        if (pattern.test(lineText)) {
          return { line: i + 1, column: Math.max(1, lineText.indexOf(targetName) + 1) };
        }
      }
    }
  }

  // 3. Strategy B: Selector match (for Service -> Pod / Deployment)
  if (edge.type.includes('bySelector') || edge.meta?.rawSelector) {
    const rawSelector = edge.meta?.rawSelector;
    if (rawSelector && typeof rawSelector === 'object') {
      const matchLabels = (rawSelector as Record<string, unknown>).matchLabels || rawSelector;
      if (typeof matchLabels === 'object' && matchLabels !== null) {
        const entries = Object.entries(matchLabels as Record<string, unknown>);
        for (const [k, v] of entries) {
          if (typeof v === 'string') {
            const selectorPairRegex = new RegExp(`^\\s*${escapeRegex(k)}:\\s*["']?${escapeRegex(v)}["']?\\s*$`, 'i');
            for (let i = searchStart; i <= searchEnd; i++) {
              if (selectorPairRegex.test(lines[i])) {
                return { line: i + 1, column: 1 };
              }
            }
          }
        }
      }
    }

    // Fallback for selector: look for 'selector:' line
    const selectorRegex = /^\s*selector:\s*$/i;
    for (let i = searchStart; i <= searchEnd; i++) {
      if (selectorRegex.test(lines[i])) {
        return { line: i + 1, column: 1 };
      }
    }
  }

  // 4. Strategy C: FieldPath hints (e.g. 'volumes', 'env', 'backend')
  if (typeof edge.meta?.fieldPath === 'string') {
    const fieldPath = edge.meta.fieldPath;
    const segments = fieldPath.split(/[\.\[\]]/).filter(Boolean);
    const lastKey = segments[segments.length - 1];
    if (lastKey && lastKey.length > 2) {
      const keyRegex = new RegExp(`^\\s*${escapeRegex(lastKey)}:`, 'i');
      for (let i = searchStart; i <= searchEnd; i++) {
        if (keyRegex.test(lines[i])) {
          return { line: i + 1, column: 1 };
        }
      }
    }
  }

  // 5. Fallback: Return the source node's line or searchStart + 1
  return { line: searchStart + 1, column: 1 };
}
