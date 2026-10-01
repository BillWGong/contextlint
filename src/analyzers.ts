import path from 'node:path';
import { access, realpath } from 'node:fs/promises';
import type { Agent, Finding, Rule } from './types.js';

const location = (r: Rule) => ({ path: r.source.path, line: r.line, endLine: r.endLine, text: r.text });
function overlap(a: Rule, b: Rule): Agent[] {
  if (a.conditional || b.conditional || a.context !== b.context) return [];
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
  return match ? (match[1] || match[2])!.toLowerCase() : null;
}
function polarity(r: Rule): { negative: boolean; action: string } | null {
  if (r.conditional) return null;
  const match = r.normalized.match(/^(always|never)\s+(.+)$/i);
  if (match) return { negative: match[1]!.toLowerCase() === 'never', action: match[2]! };
  const chinese = r.normalized.match(/^(始终|总是|必须|务必|禁止|绝不|不要)\s*(.+)$/);
  if (!chinese) return null;
  return { negative: ['禁止', '绝不', '不要'].includes(chinese[1]!), action: chinese[2]! };
}
export function analyzeRules(rules: Rule[], filter?: Agent): Finding[] {
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
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
    const a = rules[i]!, b = rules[j]!;
    const shared = overlap(a, b).filter(agent => !filter || agent === filter);
    if (!shared.length) continue;
    const managerA = packageManager(a), managerB = packageManager(b);
    const pa = polarity(a), pb = polarity(b);
    const pm = managerA && managerB && managerA !== managerB;
    const opposite = pa && pb && pa.negative !== pb.negative && pa.action === pb.action;
    if (!pm && !opposite) continue;
    result.push({ id: pm ? 'PACKAGE_MANAGER_CONFLICT' : 'POLARITY_CONFLICT', severity: 'warning', confidence: 'medium',
      message: pm ? `Potential package-manager conflict: ${managerA} / ${managerB}` : 'Potential opposite-directive conflict',
      reason: 'Explicit incompatible statements share an agent and static scope. Runtime loading and precedence are not inferred.',
      agents: shared, locations: [location(a), location(b)] });
  }
  return result;
}
export async function analyzeReferences(root: string, rules: Rule[], filter?: Agent): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const rule of rules) {
    const prose = rule.text.replace(/`+[^`]*`+/g, '');
    for (const match of prose.matchAll(/(?<!!)\[[^\]]+\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      let target = match[1]!.replace(/^<|>$/g, '').split(/[?#]/)[0]!;
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/|~)/i.test(target) || /[*{}$<>\\]/.test(target)) continue;
      try { target = decodeURIComponent(target); } catch { continue; }
      const absolute = path.resolve(root, path.dirname(rule.source.path), target);
      const relative = path.relative(root, absolute);
      if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) continue;
      try {
        await access(absolute);
        const resolved = await realpath(absolute);
        if (path.relative(root, resolved).startsWith('..')) continue;
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        findings.push({ id: 'BROKEN_REFERENCE', severity: 'warning', confidence: 'high',
          message: `Local Markdown link does not exist: ${target}`,
          reason: 'Relative Markdown link resolved from the instruction file directory, within the scan root.',
          agents: rule.source.agents.filter(agent => !filter || agent === filter), locations: [location(rule)] });
      }
    }
  }
  return findings;
}
