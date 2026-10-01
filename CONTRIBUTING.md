# Contributing

English and Chinese issues and pull requests are welcome.

```bash
pnpm install --frozen-lockfile
pnpm test
```

For a detection change, include a small fixture that demonstrates the issue and a counterexample that must not be flagged. Keep original line numbers and instruction text intact. Prefer conservative rules with a clear explanation over broader matching with uncertain results.

Interface strings live in `src/i18n.ts`. Update both languages together. JSON diagnostics remain language-independent. HTML must escape instruction text and paths; do not put file content into executable script.

Before opening a pull request, run the tests and try both languages:

```bash
node dist/cli.js examples/demo --lang en --html report-en.html
node dist/cli.js examples/zh-demo --lang zh --html report-zh.html
```

Open the reports, try the language switch and filters, and check the original evidence. Please anonymize private files and paths in any bug report.

## 中文

欢迎中文反馈。检测规则变更请同时提供正例和不应误报的反例；界面文字请同步更新中英文。提交前运行测试，并实际打开报告检查语言切换、筛选和原文显示。不要把私人路径或内部指令提交到公开 Issue。
