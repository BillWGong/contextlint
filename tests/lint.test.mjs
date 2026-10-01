import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lint } from '../dist/index.js';
import { renderHtml } from '../dist/html.js';
import { saveHtmlReport } from '../dist/report-storage.js';
import { resolveLanguage } from '../dist/i18n.js';

async function fixture(t, files) {
  const root = await mkdtemp(path.join(tmpdir(), 'contextlint-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return root;
}
const cli = path.resolve('dist/cli.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('demo identifies findings with original lines and keeps agents separate', async () => {
  const report = await lint('examples/demo');
  assert.equal(report.schemaVersion, '1.0');
  assert.equal(report.summary.files, 3);
  assert.equal(report.summary.duplicates, 1);
  assert.equal(report.summary.conflicts, 3);
  assert.equal(report.summary.brokenReferences, 1);
  assert.deepEqual(report.findings.find(f => f.id === 'DUPLICATE_RULE').locations.map(l => l.line), [5, 6]);
  assert.equal(report.findings.find(f => f.id === 'BROKEN_REFERENCE').locations[0].line, 9);
  assert.ok(report.findings.every(f => !f.agents.includes('claude') && !f.agents.includes('cursor')));
});

test('fences, quoted examples, comments, conditional prose and example sections do not produce conflicts', async t => {
  const root = await fixture(t, { 'AGENTS.md': '# Rules\nUse pnpm.\n\n```md\nUse npm.\n```\n\n> Use yarn.\n\n<!--\nUse bun.\n-->\n\nIf pnpm fails, use npm.\n\n## Examples\nUse npm.\n' });
  assert.equal((await lint(root)).summary.conflicts, 0);
});

test('wrapped rules preserve lines; negation is not normalized away', async t => {
  const root = await fixture(t, { 'AGENTS.md': '# Rules\n\n- Always run tests\n  before committing.\n- Never run tests before committing.\n' });
  const report = await lint(root);
  assert.equal(report.summary.conflicts, 1);
  assert.equal(report.summary.duplicates, 0);
  assert.deepEqual(report.findings[0].locations[0], { path: 'AGENTS.md', line: 3, endLine: 4, text: '- Always run tests before committing.' });
});

test('heading scopes, nested examples and conditional introductions suppress misleading comparisons', async t => {
  const root = await fixture(t, { 'AGENTS.md': '# Rules\nUse pnpm.\n\nIf installation fails:\n- Use npm.\n\n## Frontend\nUse yarn.\n\n## Backend\nUse bun.\n\n## Examples\n### Install\nUse npm.\n\nUse pnpm.\n' });
  assert.equal((await lint(root)).summary.conflicts, 0);
});

test('nested instruction scopes and different agents are not treated as conflicts', async t => {
  const root = await fixture(t, { 'AGENTS.md': 'Use pnpm.', 'child/AGENTS.md': 'Use npm.', 'CLAUDE.md': 'Use yarn.' });
  assert.equal((await lint(root)).summary.conflicts, 0);
  const codex = await lint(root, { agent: 'codex' });
  assert.equal(codex.summary.files, 2);
  assert.ok(codex.findings.every(f => f.agents.every(a => a === 'codex')));
});

test('conditional cursor frontmatter disables cross-file comparisons but detects in-file contradictions', async t => {
  const root = await fixture(t, {
    '.cursor/rules/a.mdc': '---\nglobs: "*.ts"\nalwaysApply: false\n---\nUse pnpm.',
    '.cursor/rules/b.mdc': '---\nglobs: "*.js"\nalwaysApply: false\n---\nUse npm.\n\nUse yarn.'
  });
  const report = await lint(root);
  assert.equal(report.summary.conflicts, 1);
  assert.equal(report.findings[0].locations[0].line, 5);
  assert.equal(report.skipped.length, 2);
});

test('same-scope alwaysApply cursor files can be compared', async t => {
  const root = await fixture(t, {
    '.cursor/rules/a.mdc': '---\nalwaysApply: true\n---\nUse pnpm.',
    '.cursor/rules/b.mdc': '---\nalwaysApply: true\n---\nUse npm.'
  });
  assert.equal((await lint(root)).summary.conflicts, 1);
});

test('links resolve from instruction directory; external, inline-code and out-of-root links are skipped', async t => {
  const root = await fixture(t, {
    'child/AGENTS.md': '[valid](./docs/ok.md)\n\n[broken](./docs/missing.md)\n\n[remote](https://example.com)\n\n[anchor](#rules)\n\n[external](../../missing.md)\n\n`[example](missing.md)`',
    'child/docs/ok.md': 'exists'
  });
  const report = await lint(root);
  assert.equal(report.summary.brokenReferences, 1);
  assert.equal(report.findings[0].locations[0].line, 3);
});

test('exclusions, default ignored folders and symlinks stay outside the scan', async t => {
  const root = await fixture(t, { 'AGENTS.md': 'Use pnpm.', 'node_modules/pkg/AGENTS.md': 'Use npm.', 'omit/AGENTS.md': 'Use npm.' });
  await symlink(path.join(root, 'AGENTS.md'), path.join(root, 'CLAUDE.md'));
  const report = await lint(root, { exclude: ['omit'] });
  assert.equal(report.summary.files, 1);
  assert.equal(report.skipped.length, 2);
  await assert.rejects(() => lint(root, { exclude: ['../outside'] }), /relative literal/);
});

test('Chinese package manager statements are detected and conditional alternatives are skipped', async t => {
  const root = await fixture(t, { 'AGENTS.md': '- 使用 pnpm 管理依赖。\n- 使用 npm 管理依赖。\n- 如果失败，使用 yarn 管理依赖。' });
  assert.equal((await lint(root)).summary.conflicts, 1);
});

test('empty repository returns a valid zero report', async t => {
  const root = await fixture(t, {});
  const report = await lint(root);
  assert.equal(report.summary.files, 0);
  assert.equal(report.summary.estimatedTokens, 0);
  assert.deepEqual(report.findings, []);
});

test('CLI JSON, strict threshold, argument errors and execution errors use specified exit codes', async () => {
  const normal = run('examples/demo', '--json');
  assert.equal(normal.status, 0);
  assert.equal(JSON.parse(normal.stdout).schemaVersion, '1.0');
  assert.equal(normal.stderr, '');
  assert.equal(run('examples/demo', '--strict').status, 1);
  assert.equal(run('examples/demo', '--agent', 'claude', '--strict').status, 0);
  for (const args of [['--agent', 'invalid'], ['--agent'], ['--invalid'], ['a', 'b'], ['not-a-directory']]) assert.equal(run(...args).status, 2);
  assert.equal(run('--help').status, 0);
  assert.equal(run('--version').stdout.trim(), '0.1.0');
});

test('reports conform to versioned schema and invalid findings are rejected', async () => {
  const schema = JSON.parse(await readFile('docs/report.schema.json', 'utf8'));
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const report = await lint('examples/demo');
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(validate(JSON.parse(await readFile('docs/demo-report.json', 'utf8'))), true);
  const invalid = structuredClone(report);
  invalid.findings[0].locations[0].line = 0;
  assert.equal(validate(invalid), false);
});

test('CRLF frontmatter keeps original lines; oversized and malformed files are reported as limited', async t => {
  const root = await fixture(t, {
    '.cursor/rules/a.mdc': '---\r\nalwaysApply: true\r\n---\r\nUse pnpm.\r\n\r\nUse npm.\r\n',
    'bad/AGENTS.md': '---\nunterminated: yes\nUse pnpm.',
    'large/CLAUDE.md': 'x'.repeat(1024 * 1024 + 1)
  });
  const report = await lint(root);
  assert.equal(report.summary.conflicts, 1);
  assert.deepEqual(report.findings[0].locations.map(l => l.line), [4, 6]);
  assert.equal(report.skipped.length, 2);
  assert.equal(report.sources.find(s => s.path === 'bad/AGENTS.md').ruleCount, 0);
});

test('visual reports contain actionable evidence and escape instruction content', async t => {
  const report = await lint('examples/demo', { agent: 'codex' });
  const hostile = structuredClone(report);
  hostile.findings[0].locations[0].text = '</pre><script>window.pwned=true</script><img src=x onerror=alert(1)>';
  hostile.findings[0].locations[0].path = '\" onmouseover=\"alert(1)';
  const html = renderHtml(hostile);
  assert.ok(html.includes('建议修改'));
  assert.ok(html.includes('第 3 行'));
  assert.ok(html.includes('data-filter="conflict"'));
  assert.ok(html.includes('&lt;script&gt;window.pwned=true&lt;/script&gt;'));
  assert.ok(!html.includes('<script>window.pwned'));
  assert.ok(html.includes('&quot; onmouseover=&quot;'));
  const root = await fixture(t, {});
  const output = path.join(root, 'report.html');
  const result = run('examples/demo', '--agent', 'codex', '--html', output);
  assert.equal(result.status, 0);
  assert.ok((await readFile(output, 'utf8')).startsWith('<!doctype html>'));
  assert.equal(run('examples/demo', '--html', output, '--strict').status, 1);
  assert.equal(run('--html', output, '--json').status, 2);
  assert.equal(run('--html', path.join(root, 'report.txt')).status, 2);
  assert.equal(run(root, '--html', path.join(root, 'missing', 'report.html')).status, 0);
  const empty = renderHtml(await lint(root));
  assert.ok(empty.includes('本次未发现已支持的问题'));
});

test('English and Chinese CLI help, findings, language errors and locale detection', () => {
  assert.ok(run('--help', '--lang', 'en').stdout.includes('Usage:'));
  assert.ok(run('--help', '--lang', 'zh').stdout.includes('用法：'));
  assert.ok(run('examples/demo', '--lang', 'en').stdout.includes('Competing package-manager choices'));
  assert.ok(run('examples/demo', '--lang', 'zh').stdout.includes('包管理器选择不一致'));
  assert.equal(run('--lang', 'fr').status, 2);
  assert.equal(run('--lang').status, 2);
  assert.ok(run('--lang', 'zh', '--agent', 'unknown').stderr.includes('未知助手'));
  assert.equal(resolveLanguage(undefined, { LANG: 'zh_CN.UTF-8' }), 'zh');
  assert.equal(resolveLanguage(undefined, { LANG: 'en_US.UTF-8' }), 'en');
  assert.equal(resolveLanguage(undefined, { LC_ALL: 'en_US.UTF-8', LANG: 'zh_CN' }), 'en');
  assert.equal(resolveLanguage('en', { LANG: 'zh_CN' }), 'en');
  assert.equal(resolveLanguage(undefined, {}), 'en');
  const english = JSON.parse(run('examples/demo', '--lang', 'en', '--json').stdout);
  const chinese = JSON.parse(run('examples/demo', '--lang', 'zh', '--json').stdout);
  assert.deepEqual(english, chinese, 'JSON stays language-independent');
});

test('bilingual HTML preserves original evidence and switches all interface copy', async () => {
  const report = await lint('examples/demo', { agent: 'codex' });
  const english = renderHtml(report, 'en'), chinese = renderHtml(report, 'zh');
  assert.ok(english.includes('<html lang="en">'));
  assert.ok(chinese.includes('<html lang="zh-CN">'));
  assert.ok(english.includes('id="language"'));
  assert.ok(english.includes('data-en="Competing package-manager choices"'));
  assert.ok(english.includes('data-zh="包管理器选择不一致"'));
  assert.ok(english.includes('<pre>- Use pnpm for this project.</pre>'));
  assert.ok(chinese.includes('<pre>- Use pnpm for this project.</pre>'));
  assert.ok(english.includes('node.textContent=node.dataset[lang]'));
});

test('Chinese directives support explicit polarity and skip conditional alternatives', async t => {
  const root = await fixture(t, { 'AGENTS.md': '# 项目规则\n- 请使用 pnpm 管理依赖。\n- 必须使用 npm 管理依赖。\n- 必须运行测试。\n- 禁止运行测试。\n- 当安装失败时，使用 yarn。' });
  const report = await lint(root);
  assert.equal(report.summary.conflicts, 2);
  assert.ok(report.findings.some(f => f.id === 'POLARITY_CONFLICT'));
});

test('report archives survive replacement, deletion of output copy and CLI exit', async t => {
  const root = await fixture(t, { 'AGENTS.md': 'Use pnpm.' });
  const output = path.join(root, 'nested', 'report.html');
  const first = await saveHtmlReport(root, 'first', output);
  const second = await saveHtmlReport(root, 'second', output);
  assert.notEqual(first.archivePath, second.archivePath);
  assert.equal(await readFile(first.archivePath, 'utf8'), 'first');
  assert.equal(await readFile(output, 'utf8'), 'second');
  await rm(output);
  assert.equal(await readFile(second.archivePath, 'utf8'), 'second');
  const result = run(root, '--html', '--lang', 'en');
  assert.equal(result.status, 0);
  const url = result.stdout.match(/file:\/\/[^\r\n]+/)[0];
  assert.ok((await readFile(new URL(url), 'utf8')).startsWith('<!doctype html>'));
  await writeFile(path.join(root, '.contextlint', 'AGENTS.md'), 'Use npm.');
  assert.equal((await lint(root)).sources.length, 1);
});
