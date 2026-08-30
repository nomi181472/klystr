import type { ContainerInfo } from '@/lib/types';

export type ContainerMetaphor =
  | 'python'
  | 'fastapi' | 'django' | 'flask' | 'gunicorn' | 'uvicorn'
  | 'javascript'
  | 'nodejs' | 'typescript' | 'nextjs' | 'nestjs' | 'express'
  | 'java'
  | 'spring' | 'quarkus' | 'micronaut'
  | 'go'
  | 'rust'
  | 'cargo' | 'actix' | 'axum'
  | 'ruby'
  | 'rails' | 'puma'
  | 'php'
  | 'laravel' | 'symfony'
  | 'dotnet'
  | 'postgresql'
  | 'mysql' | 'mariadb'
  | 'mongodb'
  | 'redis'
  | 'elasticsearch' | 'opensearch'
  | 'kafka'
  | 'rabbitmq'
  | 'nginx';

export interface ContainerMetaphorMatch {
  id: ContainerMetaphor;
  label: string;
}

type Rule = ContainerMetaphorMatch & { aliases: string[]; patterns: RegExp[] };

// Specific technologies precede runtimes so an image such as a Python-backed
// database sidecar is represented by the pod's more useful operational role.
const RULES: Rule[] = [
  { id: 'postgresql', label: 'PostgreSQL', aliases: ['postgresql', 'postgres', 'pgsql'], patterns: [/\bpostgres(?:ql)?\b/i, /\bpgsql\b/i] },
  { id: 'mariadb', label: 'MariaDB', aliases: ['mariadb'], patterns: [/\bmariadb\b/i] },
  { id: 'mysql', label: 'MySQL', aliases: ['mysql'], patterns: [/\bmysql\b/i] },
  { id: 'mongodb', label: 'MongoDB', aliases: ['mongodb', 'mongo'], patterns: [/\bmongo(?:db)?\b/i] },
  { id: 'redis', label: 'Redis', aliases: ['redis'], patterns: [/\bredis\b/i] },
  { id: 'opensearch', label: 'OpenSearch', aliases: ['opensearch'], patterns: [/\bopensearch\b/i] },
  { id: 'elasticsearch', label: 'Elasticsearch', aliases: ['elasticsearch'], patterns: [/\belasticsearch\b/i] },
  { id: 'kafka', label: 'Kafka', aliases: ['kafka'], patterns: [/\bkafka\b/i] },
  { id: 'rabbitmq', label: 'RabbitMQ', aliases: ['rabbitmq', 'amqp'], patterns: [/\brabbitmq\b/i, /\bamqp\b/i] },
  { id: 'nginx', label: 'NGINX', aliases: ['nginx'], patterns: [/\bnginx\b/i] },
  { id: 'fastapi', label: 'FastAPI', aliases: ['fastapi'], patterns: [/\bfastapi\b/i] },
  { id: 'django', label: 'Django', aliases: ['django'], patterns: [/\bdjango\b/i] },
  { id: 'flask', label: 'Flask', aliases: ['flask'], patterns: [/\bflask\b/i] },
  { id: 'gunicorn', label: 'Gunicorn', aliases: ['gunicorn'], patterns: [/\bgunicorn\b/i] },
  { id: 'uvicorn', label: 'Uvicorn', aliases: ['uvicorn'], patterns: [/\buvicorn\b/i] },
  { id: 'python', label: 'Python', aliases: ['python'], patterns: [/\bpython(?:2|3)?\b/i] },
  { id: 'nextjs', label: 'Next.js', aliases: ['nextjs'], patterns: [/\bnext(?:js)?\b/i] },
  { id: 'nestjs', label: 'NestJS', aliases: ['nestjs'], patterns: [/\bnestjs\b/i] },
  { id: 'express', label: 'Express', aliases: ['express'], patterns: [/\bexpress\b/i] },
  { id: 'typescript', label: 'TypeScript', aliases: ['typescript'], patterns: [/\btypescript\b/i] },
  { id: 'nodejs', label: 'Node.js', aliases: ['nodejs'], patterns: [/\bnode(?:js)?\b/i] },
  { id: 'javascript', label: 'JavaScript', aliases: ['javascript'], patterns: [/\bjavascript\b/i] },
  { id: 'spring', label: 'Spring', aliases: ['spring'], patterns: [/\bspring\b/i] },
  { id: 'quarkus', label: 'Quarkus', aliases: ['quarkus'], patterns: [/\bquarkus\b/i] },
  { id: 'micronaut', label: 'Micronaut', aliases: ['micronaut'], patterns: [/\bmicronaut\b/i] },
  { id: 'java', label: 'Java', aliases: ['java'], patterns: [/\bjava\b/i] },
  { id: 'go', label: 'Go', aliases: ['golang'], patterns: [/\b(golang|go)\b/i] },
  { id: 'actix', label: 'Actix', aliases: ['actix'], patterns: [/\bactix\b/i] },
  { id: 'axum', label: 'Axum', aliases: ['axum'], patterns: [/\baxum\b/i] },
  { id: 'cargo', label: 'Cargo', aliases: ['cargo'], patterns: [/\bcargo\b/i] },
  { id: 'rust', label: 'Rust', aliases: ['rust'], patterns: [/\brust\b/i] },
  { id: 'rails', label: 'Ruby on Rails', aliases: ['rails'], patterns: [/\brails\b/i] },
  { id: 'puma', label: 'Puma', aliases: ['puma'], patterns: [/\bpuma\b/i] },
  { id: 'ruby', label: 'Ruby', aliases: ['ruby'], patterns: [/\bruby\b/i] },
  { id: 'laravel', label: 'Laravel', aliases: ['laravel'], patterns: [/\blaravel\b/i] },
  { id: 'symfony', label: 'Symfony', aliases: ['symfony'], patterns: [/\bsymfony\b/i] },
  { id: 'php', label: 'PHP', aliases: ['php'], patterns: [/\bphp\b/i] },
  { id: 'dotnet', label: '.NET', aliases: ['dotnet', 'aspnet'], patterns: [/(?:^|[^a-z])(?:dotnet|\.net|aspnet)(?:$|[^a-z])/i] },
];

function hashFeature(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function vectorize(value: string, dimensions: number): number[] {
  const normalized = `^${value.toLowerCase().replaceAll(/[^a-z0-9]/g, '')}$`;
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const size of [2, 3]) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      vector[hashFeature(normalized.slice(index, index + size)) % dimensions] += 1;
    }
  }
  return vector;
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0;
}

function findCloseRule(values: string[], dimensions: number): Rule | undefined {
  const tokens = values.flatMap(value => value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 4));
  let best: { rule: Rule; similarity: number } | undefined;

  for (const rule of RULES) {
    for (const alias of rule.aliases) {
      if (alias.length < 4) continue;
      for (const token of tokens) {
        const similarity = cosineSimilarity(vectorize(token, dimensions), vectorize(alias, dimensions));
        if (similarity >= 0.7 && (!best || similarity > best.similarity)) best = { rule, similarity };
      }
    }
  }
  return best?.rule;
}

export function detectContainerMetaphor(container: ContainerInfo, requestedDimensions = 32): ContainerMetaphorMatch | undefined {
  const dimensions = Math.min(512, Math.max(16, Math.round(requestedDimensions)));
  const semanticKeys = /^(language|runtime|framework|database|datastore|technology|tech|stack)$/i;
  const explicitEvidence = container.envVars
    .filter(env => semanticKeys.test(env.name))
    .map(env => env.value ?? '');
  const evidence = [container.name, container.image, ...(container.command ?? []), ...(container.args ?? [])];

  for (const value of explicitEvidence) {
    const rule = RULES.find(candidate => candidate.patterns.some(pattern => pattern.test(value)));
    if (rule) return { id: rule.id, label: rule.label };
  }
  for (const rule of RULES) {
    if (evidence.some(value => rule.patterns.some(pattern => pattern.test(value)))) return { id: rule.id, label: rule.label };
  }
  const closeRule = findCloseRule([...explicitEvidence, ...evidence], dimensions);
  return closeRule ? { id: closeRule.id, label: closeRule.label } : undefined;
}
