#!/usr/bin/env node
import { lint } from './index.js';
import { agents, type Agent } from './types.js';
import { render } from './reporter.js';
import { renderHtml } from './html.js';
import { pathToFileURL } from 'node:url';
import { saveHtmlReport } from './report-storage.js';
import { resolveLanguage, words } from './i18n.js';

const languageIndex = process.argv.indexOf('--lang');
const language = resolveLanguage(languageIndex >= 0 ? process.argv[languageIndex + 1] : undefined);
const w = words(language);
const help = `${w.help}

  --agent claude|codex|cursor|copilot  ${w.helpAgent}
  --json                             ${w.helpJson}
  --html [output.html]                ${w.helpHtml}
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
  let html: string | true | undefined;
  const exclude: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') { console.log(help); return; }
    if (arg === '--version') { console.log('0.1.0'); return; }
    if (arg === '--json') { json = true; continue; }
    if (arg === '--strict') { strict = true; continue; }
    if (arg === '--html') {
      const next = argv[i + 1];
      html = next && !next.startsWith('-') ? argv[++i]! : true;
      continue;
    }
    if (arg === '--agent' || arg === '--exclude' || arg === '--lang') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`${arg}: ${w.requiresValue}`);
      if (arg === '--agent') {
        if (!agents.includes(value as Agent)) throw new Error(`${w.unknownAgent}: ${value}`);
        agent = value as Agent;
      } else if (arg === '--lang') { if (value !== 'en' && value !== 'zh') throw new Error(w.unknownLanguage); }
      else exclude.push(value);
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`${w.unknownOption}: ${arg}`);
    if (positional) throw new Error(w.oneDirectory);
    root = arg; positional = true;
  }
  if (json && html) throw new Error(w.incompatible);
  if (typeof html === 'string' && !html.toLowerCase().endsWith('.html')) throw new Error(w.htmlExtension);
  const report = await lint(root, { agent, exclude });
  if (html) {
    const saved = await saveHtmlReport(report.root, renderHtml(report, language), typeof html === 'string' ? html : undefined);
    console.log(`${w.saved}: ${saved.outputPath}`);
    if (saved.outputPath !== saved.archivePath) console.log(`${w.history}: ${saved.archivePath}`);
    console.log(`${w.open}: ${pathToFileURL(saved.archivePath).href}`);
  } else console.log(json ? JSON.stringify(report, null, 2) : render(report, language));
  if (strict && report.findings.some(f => f.severity === 'warning')) process.exitCode = 1;
}
main().catch((error: unknown) => {
  console.error(`ContextLint: ${w.error} — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
