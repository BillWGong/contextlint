import type { Rule, Source } from './types.js';

export function estimateTokens(text: string): number {
  const nonAscii = [...text].filter(c => c.charCodeAt(0) > 127).length;
  return Math.ceil((text.length - nonAscii) / 4 + nonAscii);
}
export function normalize(text: string): string {
  return text.replace(/^[\s]*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim()
    .replace(/\s+/g, ' ').replace(/[.!。！]+$/, '');
}
export function parse(content: string, source: Source): Rule[] {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
    if (close < 0) { source.activation = 'unknown'; return []; }
    const metadata = lines.slice(1, close).join('\n');
    if (source.agents.includes('cursor')) {
      source.activation = /^alwaysApply:\s*true\s*$/m.test(metadata) && !/^globs:\s*\S/m.test(metadata)
        ? 'directory' : 'conditional';
    } else if (source.agents.includes('copilot') && /^applyTo:/m.test(metadata)) {
      source.activation = 'conditional';
    } else if (metadata.trim()) source.activation = 'unknown';
    start = close + 1;
  }
  let fence: { char: string; length: number } | null = null;
  let comment = false;
  let quoted = false;
  const rules: Rule[] = [];
  let paragraph: string[] = [];
  let paragraphStart = 0;
  const headings: { level: number; text: string; conditional: boolean }[] = [];
  let conditionalIntro = false;
  const isConditional = (text: string) => /\b(if|unless|except|when|fallback|example|examples|for example|prefer)\b|如果|除非|例如|示例|优先|失败时|仅在|情况下|当.+时/i.test(text);
  const flush = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').trim();
    if (text) rules.push({ text, normalized: normalize(text), line: paragraphStart + 1,
      endLine: paragraphStart + paragraph.length, source,
      conditional: headings.some(h => h.conditional) || conditionalIntro || isConditional(text),
      context: headings.map(h => h.text).join(' / ') });
    if (isConditional(text) && /[:：]$/.test(text)) conditionalIntro = true;
    paragraph = [];
  };
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*>/.test(line)) { flush(); quoted = true; continue; }
    if (quoted && line.trim() && !/^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|`{3,}|~{3,})/.test(line)) continue;
    quoted = false;
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      flush();
      if (!fence) fence = { char: marker[1]![0]!, length: marker[1]!.length };
      else if (marker[1]![0] === fence.char && marker[1]!.length >= fence.length && /^\s*(?:`+|~+)\s*$/.test(line)) fence = null;
      continue;
    }
    if (fence) continue;
    // Top-level indented code is data, not an instruction. Wrapped list prose is preserved.
    if (/^(?: {4}|\t)/.test(line) && (!paragraph.length || !/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(paragraph[0]!))) { flush(); continue; }
    if (comment || line.includes('<!--')) {
      flush(); comment = !line.includes('-->'); continue;
    }
    if (/^\s*#/.test(line)) {
      flush();
      const heading = line.match(/^\s*(#+)\s*(.*?)\s*#*$/)!;
      const level = heading[1]!.length;
      while (headings.length && headings[headings.length - 1]!.level >= level) headings.pop();
      headings.push({ level, text: heading[2]!, conditional: isConditional(line) || /conditional|例外/i.test(line) });
      conditionalIntro = false;
      continue;
    }
    if (!line.trim() || /^\s*(>|\||[-*_]{3,}\s*$)/.test(line)) { flush(); continue; }
    if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) flush();
    if (!paragraph.length) paragraphStart = i;
    paragraph.push(line.trim());
  }
  flush();
  return rules;
}
