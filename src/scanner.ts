import { opendir, lstat, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isWithin, readLocalFile } from './safe-io.js';
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
  const excludes = (options.exclude ?? []).map(p => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''));
  if (excludes.some(p => !p || path.isAbsolute(p) || /^[a-z]:/i.test(p) || p.split('/').includes('..') || /[*?]/.test(p))) {
    throw new Error('--exclude requires a relative literal file or directory path (no globs)');
  }
  let entriesVisited = 0, totalBytes = 0, halted = false;
  const limited = (file: string, reason: string) => {
    if (skipped.length < 1000) skipped.push({ path: file || '.', reason });
    else if (skipped.length === 1000) skipped.push({ path: '.', reason: 'Skipped-item detail limit reached; additional paths omitted' });
  };
  async function walk(relative: string, depth = 0) {
    if (halted) return;
    if (depth > 64) { limited(relative, 'Directory depth limit reached'); return; }
    const directory = path.join(root, relative);
    const entries = [];
    try {
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !isWithin(root, await realpath(directory))) {
        limited(relative, 'Symbolic links are not followed'); return;
      }
      const handle = await opendir(directory);
      for await (const entry of handle) {
        if (++entriesVisited > 100000) {
          limited(relative, 'Scan entry limit reached'); halted = true; break;
        }
        entries.push(entry);
      }
    } catch (error) {
      if (!relative) throw error;
      limited(relative, `Directory could not be read (${(error as NodeJS.ErrnoException).code ?? 'unknown'})`); return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (halted) break;
      const file = slash(path.join(relative, entry.name));
      if (excludes.some(p => file === p || file.startsWith(p + '/'))) {
        limited(file, 'Explicitly excluded'); continue;
      }
      if (entry.isSymbolicLink()) { limited(file, 'Symbolic links are not followed'); continue; }
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) await walk(file, depth + 1);
        continue;
      }
      const metadata = describe(file);
      if (!entry.isFile() || !metadata || (options.agent && !metadata.agents.includes(options.agent))) continue;
      if (sources.length >= 1000 || totalBytes >= 8 * 1024 * 1024 || rules.length >= 10000) {
        limited(file, 'Scan file, byte or rule limit reached'); halted = true; break;
      }
      let content: string, bytes: number;
      try {
        const read = await readLocalFile(root, path.join(root, file), Math.min(1024 * 1024, 8 * 1024 * 1024 - totalBytes));
        content = read.text; bytes = read.bytes;
      } catch (error) {
        const message = (error as Error).message;
        limited(file, message === 'File size limit exceeded' ? 'Instruction file exceeds 1 MiB or remaining scan byte limit' : `Instruction file could not be read (${(error as NodeJS.ErrnoException).code ?? message})`);
        continue;
      }
      totalBytes += bytes;
      const source: Source = { ...metadata, bytes, estimatedTokens: estimateTokens(content), ruleCount: 0 };
      const extracted = parse(content, source);
      const supported = extracted.filter(r => r.text.length <= 8192);
      if (supported.length !== extracted.length) limited(file, 'Instruction paragraph exceeds 8192 character limit');
      const remaining = 10000 - rules.length;
      if (supported.length > remaining) { limited(file, 'Scan rule limit reached'); halted = true; }
      const accepted = supported.slice(0, remaining);
      source.ruleCount = accepted.length;
      if (source.activation !== 'directory') limited(file, 'Activation conditions are not resolved; cross-file comparisons disabled');
      sources.push(source); rules.push(...accepted);
    }
  }
  await walk('');
  return { root, sources, rules, skipped };
}
