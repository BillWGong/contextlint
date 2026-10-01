import type { Report } from './types.js';
import { describeFinding, skipReason, words, type Language } from './i18n.js';
export function render(report: Report, language: Language = 'en'): string {
  const s = report.summary, w = words(language);
  const lines = ['ContextLint', '', `${w.found} ${s.files} ${w.files} · ~${s.estimatedTokens.toLocaleString('en-US')} ${w.tokens}`,
    `${s.conflicts} ${w.conflicts} · ${s.duplicates} ${w.duplicates} · ${s.brokenReferences} ${w.references}`, ''];
  for (const source of report.sources) lines.push(`  ${source.path}  ~${source.estimatedTokens} tokens · ${source.ruleCount} ${w.ruleCount} · ${source.agents.join(', ')} · ${source.activation === 'directory' ? w.directory : w.conditional}`);
  for (const finding of report.findings) {
    const description = describeFinding(finding.id, language);
    lines.push('', `[${w[finding.severity]}] ${finding.id} (${finding.agents.join(', ')})`, description.title);
    for (const loc of finding.locations) lines.push(`  ${loc.path}:${loc.line}${loc.endLine !== loc.line ? '-' + loc.endLine : ''}  ${loc.text}`);
    lines.push(`  ${w.reason}: ${description.reason}`, `  ${w.fix}: ${description.fix}`);
  }
  if (report.skipped.length) { lines.push('', w.skipped + ':'); for (const item of report.skipped) lines.push(`  ${item.path}: ${skipReason(item.reason, language)}`); }
  lines.push('', w.terminalFooter);
  return lines.join('\n');
}
