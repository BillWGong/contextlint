#!/usr/bin/env node
import { lint } from './index.js';
import { agents, type Agent } from './types.js';
import { render } from './reporter.js';
import { renderHtml } from './html.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveLanguage, words } from './i18n.js';

const languageIndex = process.argv.indexOf('--lang');
const language = resolveLanguage(languageIndex >= 0 ? process.argv[languageIndex + 1] : undefined);
const w = words(language);
const help = `${w.help}

  --agent claude|codex|cursor|copilot  ${w.helpAgent}
  --json                             ${w.helpJson}
  --html <output.html>                ${w.helpHtml}
  --lang en|zh                       ${w.helpLang}
  --strict                           ${w.helpStrict}
  --exclude <relative-path>           ${w.helpExclude}
  --help                             ${w.helpHelp}
  --version                          ${w.helpVersion}

${w.exitCodes}`;
async function main() {
  const argv = process.argv.slice(2);
  let root = '.', positional = false, json = false, strict = false;
  let agent: Agent | undefined;
  let html: string | undefined;
  const exclude: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') { console.log(help); return; }
    if (arg === '--version') { console.log('0.1.0'); return; }
    if (arg === '--json') { json = true; continue; }
    if (arg === '--strict') { strict = true; continue; }
    if (arg === '--agent' || arg === '--exclude' || arg === '--html' || arg === '--lang') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`${arg}: ${w.requiresValue}`);
      if (arg === '--agent') {
        if (!agents.includes(value as Agent)) throw new Error(`${w.unknownAgent}: ${value}`);
        agent = value as Agent;
      } else if (arg === '--html') html = value;
      else if (arg === '--lang') { if (value !== 'en' && value !== 'zh') throw new Error(w.unknownLanguage); }
      else exclude.push(value);
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`${w.unknownOption}: ${arg}`);
    if (positional) throw new Error(w.oneDirectory);
    root = arg; positional = true;
  }
  if (json && html) throw new Error(w.incompatible);
  if (html && !html.toLowerCase().endsWith('.html')) throw new Error(w.htmlExtension);
  const report = await lint(root, { agent, exclude });
  if (html) {
    await writeFile(html, renderHtml(report, language), 'utf8');
    console.log(`${w.saved}: ${path.resolve(html)}`);
  } else console.log(json ? JSON.stringify(report, null, 2) : render(report, language));
  if (strict && report.findings.some(f => f.severity === 'warning')) process.exitCode = 1;
}
main().catch((error: unknown) => {
  console.error(`ContextLint: ${w.error} — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
