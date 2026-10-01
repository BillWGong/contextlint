import { readdir, readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Source, Rule, ScanOptions, Report } from './types.js';
import { estimateTokens, parse } from './parser.js';

const ignored = new Set(['.git', '.contextlint', 'node_modules', 'dist', 'build', 'coverage', '.next', '.venv', 'vendor']);
const slash = (p: string) => p.split(path.sep).join('/');
export function describe(file: string): Omit<Source, 'bytes' | 'estimatedTokens' | 'ruleCount'> | null {
  const parent = path.posix.dirname(file);
  if (path.posix.basename(file) === 'AGENTS.md') return { path: file, agents: ['codex', 'copilot'], scope: parent, activation: 'directory' };
  if (path.posix.basename(file) === 'CLAUDE.md') return { path: file, agents: ['claude'], scope: parent, activation: 'directory' };
  const match = file.match(/^(?:(.*)\/)?(\.claude\/rules\/.*\.md|\.cursor\/rules\/.*\.(?:mdc|md)|\.github\/copilot-instructions\.md|\.github\/instructions\/.*\.instructions\.md)$/);
  if (!match) return null;
  const kind = match[2]!;
  return { path: file, scope: match[1] || '.', agents: [kind.startsWith('.claude') ? 'claude' : kind.startsWith('.cursor') ? 'cursor' : 'copilot'],
    activation: kind.includes('/rules/') || kind.includes('/instructions/') ? 'conditional' : 'directory' };
}
export async function scan(rootInput: string, options: ScanOptions) {
  const root = await realpath(path.resolve(rootInput));
  if (!(await stat(root)).isDirectory()) throw new Error('Scan target must be a directory');
  const sources: Source[] = [], rules: Rule[] = [];
  const skipped: Report['skipped'] = [];
  const excludes = (options.exclude ?? []).map(p => p.replace(/^\.\//, '').replace(/\/$/, ''));
  if (excludes.some(p => !p || path.isAbsolute(p) || p.split('/').includes('..') || /[*?]/.test(p))) {
    throw new Error('--exclude requires a relative literal file or directory path (no globs)');
  }
  async function walk(relative: string) {
    const entries = (await readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const file = slash(path.join(relative, entry.name));
      if (excludes.some(p => file === p || file.startsWith(p + '/'))) {
        skipped.push({ path: file, reason: 'Explicitly excluded' }); continue;
      }
      if (entry.isSymbolicLink()) { skipped.push({ path: file, reason: 'Symbolic links are not followed' }); continue; }
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) await walk(file);
        continue;
      }
      const metadata = describe(file);
      if (!entry.isFile() || !metadata || (options.agent && !metadata.agents.includes(options.agent))) continue;
      const info = await stat(path.join(root, file));
      if (info.size > 1024 * 1024) { skipped.push({ path: file, reason: 'Instruction file exceeds 1 MiB limit' }); continue; }
      const content = await readFile(path.join(root, file), 'utf8');
      const source: Source = { ...metadata, bytes: info.size, estimatedTokens: estimateTokens(content), ruleCount: 0 };
      const extracted = parse(content, source);
      source.ruleCount = extracted.length;
      if (source.activation !== 'directory') skipped.push({ path: file, reason: 'Activation conditions are not resolved; cross-file comparisons disabled' });
      sources.push(source); rules.push(...extracted);
    }
  }
  await walk('');
  return { root, sources, rules, skipped };
}
