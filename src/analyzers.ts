import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { isWithin } from './safe-io.js';
import type { Agent, Finding, Rule, Report } from './types.js';

const location = (r: Rule) => ({ path: r.source.path, line: r.line, endLine: r.endLine, text: r.text });
function overlap(a: Rule, b: Rule, projectPackageManager = false): Agent[] {
  if (a.conditional || b.conditional) return [];
  // Only package-manager choices within one file may cross heading boundaries.
  if (a.context !== b.context && !(projectPackageManager && a.source.path === b.source.path)) return [];
  const agents = a.source.agents.filter(agent => b.source.agents.includes(agent));
  if (!agents.length) return [];
  if (a.source.path === b.source.path) return agents;
  // Descendant instruction files may override parent rules. Do not treat those as conflicts.
  if (a.source.activation !== 'directory' || b.source.activation !== 'directory' || a.source.scope !== b.source.scope) return [];
  return agents;
}
function packageManager(r: Rule): string | null {
  if (r.conditional) return null;
  const text = r.normalized.replace(/`([^`]+)`/g, '$1');
  const match = text.match(/^(?:always\s+)?use\s+(npm|pnpm|yarn|bun)(?:\s+(?:for (?:this |the )?project|as (?:the |your )?package manager|for (?:package|dependency) management))?$|^(?:请|必须|始终|总是|务必)?(?:使用|用)\s*(npm|pnpm|yarn|bun)(?:\s*(?:管理依赖|作为包管理器))?$/i);
  if (match) return (match[1] || match[2])!.toLowerCase();
  // A small closed grammar: reject unknown prose rather than infer intent from mentions.
  if (text.length > 160) return null;
  const clauses = text.toLowerCase().split(/[.!;,。！；，]+/).map(c => c.trim()).filter(Boolean);
  let selected: string | null = null;
  const excluded = new Set<string>();
  for (const clause of clauses) {
    const negative = clause.match(/^(?:not\s+|(?:不用|不要用|禁止使用|禁用)\s*)(npm|pnpm|yarn|bun)$|^(npm|pnpm|yarn|bun)\s+(?:is\s+(?:legacy|a workaround)|禁用)$/);
    if (negative) { excluded.add((negative[1] || negative[2])!); continue; }
    const affirmative = clause.match(/^(npm|pnpm|yarn|bun)(?:\s+install\s+or\s+go\s+home)?$|^(?:always\s+)?use\s+(npm|pnpm|yarn|bun)(?:\s+(?:for (?:this |the )?project|as (?:the |your )?package manager|for (?:package|dependency) management))?$|^(?:请|必须|始终|总是|务必)?(?:使用|用)\s*(npm|pnpm|yarn|bun)(?:\s*(?:管理依赖|作为包管理器))?$/);
    if (affirmative) {
      const manager = (affirmative[1] || affirmative[2] || affirmative[3])!;
      if (selected && selected !== manager) return null;
      selected = manager;
      continue;
    }
    // Rhetoric only reinforces an already explicit choice; it cannot select a tool.
    if (selected && clause === `${selected} is the future`) continue;
    return null;
  }
  return selected && !excluded.has(selected) ? selected : null;
}
function polarity(r: Rule): { negative: boolean; action: string } | null {
  if (r.conditional) return null;
  const match = r.normalized.match(/^(always|never)\s+(.+)$/i);
  if (match) return { negative: match[1]!.toLowerCase() === 'never', action: match[2]! };
  const chinese = r.normalized.match(/^(始终|总是|必须|务必|禁止|绝不|不要)\s*(.+)$/);
  if (!chinese) return null;
  return { negative: ['禁止', '绝不', '不要'].includes(chinese[1]!), action: chinese[2]! };
}
export function analyzeRules(rules: Rule[], filter?: Agent, skipped?: Report['skipped']): Finding[] {
  const limit = () => skipped?.push({ path: '.', reason: 'Conflict comparison or finding limit reached' });
  const findings: Finding[] = [];
  const duplicateGroups = new Map<string, Rule[]>();
  for (const rule of rules) {
    if (rule.normalized.length < 12 || rule.conditional) continue;
    const group = duplicateGroups.get(rule.normalized) ?? [];
    group.push(rule); duplicateGroups.set(rule.normalized, group);
  }
  for (const group of duplicateGroups.values()) {
    // Connected components could imply overlap transitively; instead group by identical scope/activation.
    const buckets = new Map<string, Rule[]>();
    for (const r of group) {
      const key = JSON.stringify([r.context, r.source.activation === 'directory' ? `scope:${r.source.scope}` : `file:${r.source.path}`]);
      const bucket = buckets.get(key) ?? []; bucket.push(r); buckets.set(key, bucket);
    }
    for (const bucket of buckets.values()) {
      for (const agent of filter ? [filter] : ['claude', 'codex', 'cursor', 'copilot'] as Agent[]) {
        const relevant = bucket.filter(r => r.source.agents.includes(agent));
        if (relevant.length < 2) continue;
        findings.push({ id: 'DUPLICATE_RULE', severity: 'warning', confidence: 'high', message: 'Repeated rule in the same static scope',
          reason: 'Rule text matches after removing list markers, whitespace differences and trailing sentence punctuation.',
          agents: [agent], locations: relevant.map(location) });
      }
    }
  }
  // Merge duplicate findings that describe the same locations for several agents.
  const merged = new Map<string, Finding>();
  for (const f of findings) {
    const key = JSON.stringify(f.locations);
    const previous = merged.get(key);
    if (previous) previous.agents.push(...f.agents); else merged.set(key, f);
  }
  const result = [...merged.values()];
  if (result.length >= 1000) { limit(); return result.slice(0, 1000); }
  const recognized = rules.map(rule => ({ rule, manager: packageManager(rule), polarity: polarity(rule) }));
  const managerKinds = new Set(recognized.map(c => c.manager).filter(Boolean));
  const directions = new Map<string, Set<boolean>>();
  for (const candidate of recognized) if (candidate.polarity) {
    const values = directions.get(candidate.polarity.action) ?? new Set<boolean>();
    values.add(candidate.polarity.negative); directions.set(candidate.polarity.action, values);
  }
  const candidates = recognized.filter(c => (c.manager && managerKinds.size > 1)
    || (c.polarity && directions.get(c.polarity.action)!.size > 1));
  let comparisons = 0;
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    if (++comparisons > 200000 || result.length >= 1000) { limit(); return result; }
    const ca = candidates[i]!, cb = candidates[j]!;
    const a = ca.rule, b = cb.rule;
    const shared = overlap(a, b).filter(agent => !filter || agent === filter);
    const managerShared = overlap(a, b, true).filter(agent => !filter || agent === filter);
    if (!shared.length && !managerShared.length) continue;
    const managerA = ca.manager, managerB = cb.manager;
    const pa = ca.polarity, pb = cb.polarity;
    const pm = managerShared.length && managerA && managerB && managerA !== managerB;
    const opposite = shared.length && pa && pb && pa.negative !== pb.negative && pa.action === pb.action;
    if (!pm && !opposite) continue;
    result.push({ id: pm ? 'PACKAGE_MANAGER_CONFLICT' : 'POLARITY_CONFLICT', severity: 'warning', confidence: 'medium',
      message: pm ? `Potential package-manager conflict: ${managerA} / ${managerB}` : 'Potential opposite-directive conflict',
      reason: 'Explicit incompatible statements share an agent and static scope. Runtime loading and precedence are not inferred.',
      agents: pm ? managerShared : shared, locations: [location(a), location(b)] });
  }
  return result;
}
export async function analyzeReferences(root: string, rules: Rule[], filter?: Agent, skipped?: Report['skipped']): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const rule of rules) {
    const prose = rule.text.replace(/`+[^`]*`+/g, '');
    for (const match of prose.matchAll(/(?<!!)\[[^\[\]\n]+\]\(([^\s()]+)(?:[ \t]+"[^"\n]*")?\)/g)) {
      let target = match[1]!.replace(/^<|>$/g, '').split(/[?#]/)[0]!;
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/|~)/i.test(target) || /[*{}$<>\\]/.test(target)) continue;
      try { target = decodeURIComponent(target); } catch { continue; }
      const absolute = path.resolve(root, path.dirname(rule.source.path), target);
      if (!isWithin(root, absolute)) continue;
      try {
        const parent = await realpath(path.dirname(absolute));
        if (!isWithin(root, parent)) continue;
        if ((await lstat(absolute)).isSymbolicLink()) continue;
        const resolved = await realpath(absolute);
        if (!isWithin(root, resolved)) continue;
      } catch (error) {
        if (findings.length >= 1000) { skipped?.push({ path: '.', reason: 'Reference finding limit reached' }); return findings; }
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          skipped?.push({ path: rule.source.path, reason: `Reference could not be checked (${(error as NodeJS.ErrnoException).code ?? 'unknown'})` });
          continue;
        }
        findings.push({ id: 'BROKEN_REFERENCE', severity: 'warning', confidence: 'high',
          message: `Local Markdown link does not exist: ${target}`,
          reason: 'Relative Markdown link resolved from the instruction file directory, within the scan root.',
          agents: rule.source.agents.filter(agent => !filter || agent === filter), locations: [location(rule)] });
      }
    }
  }
  return findings;
}
