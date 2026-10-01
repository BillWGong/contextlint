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

test('package choices cross headings while nested examples and conditional introductions stay excluded', async t => {
  const root = await fixture(t, { 'AGENTS.md': '# Rules\nUse pnpm.\n\nIf installation fails:\n- Use npm.\n\n## Frontend\nUse yarn.\n\n## Backend\nUse bun.\n\n## Examples\n### Install\nUse npm.\n\nUse pnpm.\n' });
  const report = await lint(root);
  assert.equal(report.summary.conflicts, 3);
  assert.ok(report.findings.every(f => f.id === 'PACKAGE_MANAGER_CONFLICT'));
  assert.deepEqual([...new Set(report.findings.flatMap(f => f.locations.map(l => l.line)))].sort((a,b) => a-b), [2, 8, 11]);
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
  assert.ok(empty.includes('没有检查到指令文件'));
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

test('report names use scanned project metadata with directory fallback and safe HTML', async t => {
  const root = await fixture(t, { 'package.json': JSON.stringify({ name: '@team/真实项目<script>' }) });
  const report = await lint(root);
  assert.equal(report.projectName, '@team/真实项目<script>');
  assert.ok(renderHtml(report, 'zh').includes('@team/真实项目&lt;script&gt;'));
  await writeFile(path.join(root, 'package.json'), '{bad json');
  assert.equal((await lint(root)).projectName, path.basename(root));
  await rm(path.join(root, 'package.json'));
  assert.equal((await lint(root)).projectName, path.basename(root));
});

test('colloquial package declarations conflict within and across headings, retaining evidence', async t => {
  for (const [a, b] of [
    ['Use pnpm for this project.', 'Use bun for this project.'],
    ['pnpm. not npm, not yarn. pnpm.', 'bun. npm is legacy, pnpm is a workaround, bun is the future. bun install or go home.'],
    ['用 pnpm，不用 npm。', 'bun install or go home.']
  ]) {
    for (const across of [false, true]) {
      const root = await fixture(t, { 'CLAUDE.md': `## Main\n- ${a}\n\n${across ? '## Later' : ''}\n2. ${b}\n` });
      const report = await lint(root);
      assert.equal(report.findings.length, 1, `${a} / ${b}, across=${across}`);
      assert.equal(report.findings[0].id, 'PACKAGE_MANAGER_CONFLICT');
      assert.deepEqual(report.findings[0].locations.map(l => l.line), [2, 5]);
      assert.match(report.findings[0].message, /pnpm \/ bun/);
    }
  }
});

test('negative mentions, ambiguous prose and conditional colloquialisms never select a tool', async t => {
  for (const text of [
    'pnpm is a workaround', 'npm is legacy', 'not npm', 'yarn 禁用', '不用 npm',
    'bun is the future', 'pnpm supports workspaces', 'npm install', 'pnpm. bun.',
    'Use npm. npm is legacy.', 'If needed, bun install or go home.',
    '如果安装失败，用 npm，不用 pnpm。', 'pnpm. this article discusses installation.'
  ]) {
    const root = await fixture(t, { 'AGENTS.md': `Use bun.\n\n${text}\n\nUse bun.\n` });
    assert.equal((await lint(root)).summary.conflicts, 0, text);
  }
  const root = await fixture(t, { 'AGENTS.md': 'Use bun.\n\npnpm is a workaround\n\nnpm is legacy\n\nyarn 禁用' });
  assert.equal((await lint(root)).summary.conflicts, 0);
});

test('colloquial package choices in fences, blockquotes and example sections stay ignored', async t => {
  const root = await fixture(t, { 'CLAUDE.md': 'pnpm. not npm, not yarn. pnpm.\n\n```md\nbun install or go home.\n```\n\n> bun install or go home.\n\n## Examples\nbun install or go home.' });
  assert.equal((await lint(root)).summary.conflicts, 0);
});

test('heading exemption does not extend to polarity, duplicates or separate instruction files', async t => {
  const root = await fixture(t, {
    'AGENTS.md': '## First\nAlways run tests.\n\nKeep all identifiers descriptive.\n\nUse pnpm.\n\n## Second\nNever run tests.\n\nKeep all identifiers descriptive.',
    'CLAUDE.md': '## First\nUse yarn.',
    '.cursor/rules/a.mdc': '---\nalwaysApply: true\n---\n## First\nUse pnpm.',
    '.cursor/rules/b.mdc': '---\nalwaysApply: true\n---\n## Second\nUse bun.',
    'child/AGENTS.md': '## Second\nUse bun.'
  });
  assert.deepEqual((await lint(root)).findings, []);
});

test('rulerot reproduction retains original line 20 and 372 across headings', async t => {
  const lines = Array(373).fill('');
  lines[16] = '## the stack (non-negotiables)';
  lines[19] = '- pnpm. not npm, not yarn. pnpm.';
  lines[365] = '## cracked cursor rules i stole from a 100k mrr guy';
  lines[371] = '2. bun. npm is legacy, pnpm is a workaround, bun is the future. bun install or go home.';
  const root = await fixture(t, { 'CLAUDE.md': lines.join('\n') });
  const report = await lint(root);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].id, 'PACKAGE_MANAGER_CONFLICT');
  assert.deepEqual(report.findings[0].locations.map(l => l.line), [20, 372]);
  assert.equal((await lint(root, { agent: 'codex' })).summary.conflicts, 0);
});

test('terminal and HTML safely display repository control characters without mutating JSON evidence', async t => {
  const { render } = await import('../dist/reporter.js');
  const root = await fixture(t, { 'AGENTS.md': 'Always run tests\x1b[2J\u202e.\n\nNever run tests\x1b[2J\u202e.' });
  const report = await lint(root);
  assert.equal(report.summary.conflicts, 1);
  assert.ok(report.findings[0].locations[0].text.includes('\x1b'));
  const terminal = render(report);
  assert.ok(!terminal.includes('\x1b'));
  assert.ok(terminal.includes('\\u001b'));
  assert.ok(!terminal.includes('\u202e'));
  const html = renderHtml(report);
  assert.ok(!html.includes('\x1b'));
  assert.ok(!html.includes('\u202e'));
});

test('report output refuses symlinks and linked history directories without touching targets', async t => {
  const root = await fixture(t, { 'important.txt': 'original' });
  const output = path.join(root, 'report.html');
  await symlink(path.join(root, 'important.txt'), output);
  await assert.rejects(saveHtmlReport(root, 'report', output), /Report retained:/);
  assert.equal(await readFile(path.join(root, 'important.txt'), 'utf8'), 'original');
  const outside = await fixture(t, {});
  const other = await fixture(t, {});
  await symlink(outside, path.join(other, '.contextlint'), 'dir');
  await assert.rejects(saveHtmlReport(other, 'report'), /real directories/);
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(outside), []);
});

test('report output replaces hard-linked copies atomically and creates private histories', async t => {
  const { link, stat } = await import('node:fs/promises');
  const root = await fixture(t, { 'important.html': 'original' });
  const output = path.join(root, 'report.html');
  await link(path.join(root, 'important.html'), output);
  const saved = await saveHtmlReport(root, 'report', output);
  assert.equal(await readFile(path.join(root, 'important.html'), 'utf8'), 'original');
  assert.equal(await readFile(output, 'utf8'), 'report');
  if (process.platform !== 'win32') {
    assert.equal((await stat(saved.archivePath)).mode & 0o777, 0o600);
    assert.equal((await stat(path.dirname(saved.archivePath))).mode & 0o777, 0o700);
  }
});

test('top-level indented code is ignored and wrapped list instructions still parse', async t => {
  const root = await fixture(t, { 'AGENTS.md': 'Use pnpm.\n\n    Use npm.\n\tUse yarn.\n\n- Always run tests\n    before committing.\n- Never run tests before committing.' });
  const report = await lint(root);
  assert.equal(report.summary.conflicts, 1);
  assert.equal(report.findings[0].id, 'POLARITY_CONFLICT');
  assert.deepEqual(report.findings[0].locations.map(l => l.line), [6, 8]);
});

test('optional HTML path does not swallow a scan directory and -- supports dashed directory names', async t => {
  const root = await fixture(t, { 'AGENTS.md': 'Use pnpm.' });
  const result = run('--html', root, '--lang', 'en');
  assert.equal(result.status, 0);
  const url = result.stdout.match(/file:\/\/[^\r\n]+/)[0];
  assert.ok((await readFile(new URL(url), 'utf8')).includes('AGENTS.md'));
  assert.equal(run('--lang', 'en', '--', root).status, 0);
  const dashed = await fixture(t, { '-project/AGENTS.md': 'Use pnpm.' });
  assert.equal(spawnSync(process.execPath, [cli, '--json', '--', '-project'], { cwd: dashed, encoding: 'utf8' }).status, 0);
});

test('no sources and limited scans cannot silently pass strict CI', async t => {
  const empty = await fixture(t, {});
  const report = await lint(empty);
  assert.equal(report.status, 'no-sources');
  assert.ok(renderHtml(report, 'en').includes('No instruction files checked'));
  assert.equal(run(empty, '--strict', '--json').status, 2);
  const limited = await fixture(t, { 'AGENTS.md': 'x'.repeat(1024 * 1024 + 1) });
  const partial = await lint(limited);
  assert.equal(partial.status, 'limited');
  assert.ok(renderHtml(partial, 'zh').includes('本次分析不完整'));
  const result = run(limited, '--strict', '--json');
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, 'limited');
});

test('resource limits bound conflict floods and long paragraphs with explicit limited status', async t => {
  const root = await fixture(t, { 'AGENTS.md': Array.from({ length: 100 }, (_, i) => `- Use ${i % 2 ? 'pnpm' : 'bun'}.`).join('\n') });
  const report = await lint(root);
  assert.equal(report.status, 'limited');
  assert.ok(report.findings.length <= 1000);
  assert.ok(report.skipped.some(item => item.reason.includes('finding limit')));
  const long = await fixture(t, { 'AGENTS.md': 'Always ' + 'run '.repeat(3000) });
  const partial = await lint(long);
  assert.equal(partial.status, 'limited');
  assert.equal(partial.summary.rules, 0);
});

test('portable exclusion paths cannot escape the root, and malformed link floods finish safely', async t => {
  const root = await fixture(t, { 'AGENTS.md': '['.repeat(8000), 'child/AGENTS.md': 'Use pnpm.' });
  await assert.rejects(lint(root, { exclude: ['..\\outside'] }), /relative literal/);
  await assert.rejects(lint(root, { exclude: ['C:\\outside'] }), /relative literal/);
  assert.equal((await lint(root, { exclude: ['child\\AGENTS.md'] })).summary.files, 1);
  assert.equal((await lint(root)).summary.brokenReferences, 0);
});

test('project metadata cannot follow a repository symlink outside the scan root', async t => {
  const outside = await fixture(t, { 'package.json': '{"name":"outside-secret"}' });
  const root = await fixture(t, {});
  await symlink(path.join(outside, 'package.json'), path.join(root, 'package.json'));
  assert.equal((await lint(root)).projectName, path.basename(root));
});

test('lazy blockquote continuations are ignored without swallowing later headings', async t => {
  const root = await fixture(t, { 'AGENTS.md': 'Use pnpm.\n\n> quoted example\nUse npm.\n\n## Rules\nUse bun.' });
  const report = await lint(root);
  assert.equal(report.summary.conflicts, 1);
  assert.deepEqual(report.findings[0].locations.map(l => l.line), [1, 7]);
});

test('the final language flag controls output and JSON keeps raw controls safely encoded', async t => {
  assert.ok(run('--help', '--lang', 'zh', '--lang', 'en').stdout.includes('Usage:'));
  const root = await fixture(t, { 'AGENTS.md': 'Always test\x1b[2J.\n\nNever test\x1b[2J.' });
  const output = run(root, '--json');
  assert.ok(!output.stdout.includes('\x1b'));
  assert.ok(JSON.parse(output.stdout).findings[0].locations[0].text.includes('\x1b'));
});

test('offline HTML restricts scripts to the generated hash and disallows network resources', async () => {
  const { createHash } = await import('node:crypto');
  const html = renderHtml(await lint('examples/demo'));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes(`script-src 'sha256-${hash}'`));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("form-action 'none'"));
});

test('a linked report subdirectory cannot create files or directories outside the scanned project', async t => {
  const root = await fixture(t, {});
  const outside = await fixture(t, {});
  await symlink(outside, path.join(root, 'linked'), 'dir');
  await assert.rejects(saveHtmlReport(root, 'report', path.join(root, 'linked', 'new', 'report.html')), /escapes scan root/);
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(outside), []);
});

test('many identical package choices do not exhaust the conflict budget needlessly', async t => {
  const root = await fixture(t, { 'AGENTS.md': Array(1000).fill('- Use pnpm for this project.').join('\n') });
  const report = await lint(root);
  assert.equal(report.status, 'complete');
  assert.equal(report.summary.conflicts, 0);
  assert.equal(report.summary.duplicates, 1);
});
