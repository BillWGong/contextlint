import path from 'node:path';
import { readLocalFile } from './safe-io.js';
import { scan, describe } from './scanner.js';
import { analyzeReferences, analyzeRules } from './analyzers.js';
import type { Report, ScanOptions } from './types.js';
export type { Report, ScanOptions, Finding, Source, Agent } from './types.js';

async function projectName(root: string): Promise<string> {
  try {
    const manifest = path.join(root, 'package.json');
    const data = JSON.parse((await readLocalFile(root, manifest, 1024 * 1024)).text);
    if (typeof data?.name === 'string' && data.name.trim()) return data.name.trim();
  } catch { /* Missing or invalid metadata falls back to the scanned directory. */ }
  return path.basename(root) || root;
}

export async function lint(root = '.', options: ScanOptions = {}): Promise<Report> {
  const scanned = await scan(root, options);
  const findings = [...analyzeRules(scanned.rules, options.agent, scanned.skipped), ...await analyzeReferences(scanned.root, scanned.rules, options.agent, scanned.skipped)]
    .sort((a, b) => a.locations[0]!.path.localeCompare(b.locations[0]!.path, 'en') || a.locations[0]!.line - b.locations[0]!.line || a.id.localeCompare(b.id));
  return {
    schemaVersion: '1.0', root: scanned.root, projectName: await projectName(scanned.root),
    status: scanned.skipped.some(item => item.reason !== 'Explicitly excluded' && (item.reason !== 'Symbolic links are not followed' || Boolean(describe(item.path)))) ? 'limited' : scanned.sources.length ? 'complete' : 'no-sources',
    options: { agent: options.agent ?? null, exclude: options.exclude ?? [] },
    tokenEstimation: 'Heuristic: ASCII UTF-16 units / 4 + non-ASCII code points. Not a model tokenizer or session cost.',
    sources: scanned.sources, skipped: scanned.skipped, findings,
    summary: { files: scanned.sources.length, rules: scanned.rules.length,
      estimatedTokens: scanned.sources.reduce((sum, s) => sum + s.estimatedTokens, 0),
      conflicts: findings.filter(f => f.id.endsWith('CONFLICT')).length,
      duplicates: findings.filter(f => f.id === 'DUPLICATE_RULE').length,
      brokenReferences: findings.filter(f => f.id === 'BROKEN_REFERENCE').length }
  };
}
