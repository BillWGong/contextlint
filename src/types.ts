export const agents = ['claude', 'codex', 'cursor', 'copilot'] as const;
export type Agent = typeof agents[number];
export interface Source {
  path: string;
  agents: Agent[];
  scope: string;
  activation: 'directory' | 'conditional' | 'unknown';
  estimatedTokens: number;
  bytes: number;
  ruleCount: number;
}
export interface Rule {
  text: string;
  normalized: string;
  line: number;
  endLine: number;
  source: Source;
  conditional: boolean;
  context: string;
}
export interface Location { path: string; line: number; endLine: number; text: string }
export interface Finding {
  id: 'DUPLICATE_RULE' | 'PACKAGE_MANAGER_CONFLICT' | 'POLARITY_CONFLICT' | 'BROKEN_REFERENCE';
  severity: 'info' | 'warning';
  confidence: 'high' | 'medium';
  message: string;
  reason: string;
  agents: Agent[];
  locations: Location[];
}
export interface Report {
  schemaVersion: '1.0';
  root: string;
  options: { agent: Agent | null; exclude: string[] };
  tokenEstimation: string;
  sources: Source[];
  findings: Finding[];
  skipped: { path: string; reason: string }[];
  summary: { files: number; rules: number; estimatedTokens: number; conflicts: number; duplicates: number; brokenReferences: number };
}
export interface ScanOptions { agent?: Agent; exclude?: string[] }
