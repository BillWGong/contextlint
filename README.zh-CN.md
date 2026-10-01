<p align="center"><img src="assets/banner.svg" alt="ContextLint：检查编程助手的指令" width="100%" /></p>

<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>

# ContextLint

**检查编程助手背后的指令，把问题和依据一起展示出来。**

一个本地 CLI：扫描 `AGENTS.md`、`CLAUDE.md` 等指令文件，寻找重复规则、明确的潜在冲突和失效链接。生成的可视化报告保留原文、文件行号、检测依据和修改建议。

扫描时无需 API key、不调用模型、不上传文件。

![原文对比示意](assets/finding.svg)

## 开始使用

需要 **Node.js 22+** 和 **pnpm**。当前为早期版本，从源码运行，尚未发布到 npm。

```bash
git clone https://github.com/BillWGong/contextlint.git
cd contextlint
pnpm install --frozen-lockfile
pnpm build

# 先运行中文示例
node dist/cli.js examples/zh-demo --agent codex --lang zh --html report.html
```

在浏览器打开 `report.html`。右上角可以切换 **English / 简体中文**，也可以按类型筛选、搜索指令原文。报告离线可查看，筛选和语言切换需要 JavaScript。

然后换成自己的项目路径：

```bash
node dist/cli.js /你的项目路径 --agent codex --lang zh --html report.html
```

每次生成 HTML 都会在 `<扫描项目>/.contextlint/reports/` 保存一份独立历史报告，命令退出后仍可打开，不会自动删除。终端会显示绝对路径和 `file://` 链接。使用 `--html report.html` 还会额外保存一份便于查找的副本，并自动创建父目录；再次扫描不会覆盖历史记录。扫描项目需要可写。

去掉 `--html` 就会直接显示终端报告。CLI 默认按系统语言选择中文或英文，也可以用 `--lang en|zh` 指定。指令原文始终保持原样，不进行机器翻译。

## 能发现什么

| 检查 | 展示的依据 | 修改方向 |
| --- | --- | --- |
| 包管理器选择冲突 | 明确的 pnpm / npm 等选择 | 检查 lockfile，统一工具或说明范围 |
| 相反的动作要求 | 相同动作被要求和禁止 | 保留预期规则，或补充适用条件 |
| 重复规则 | 有限归一化后相同的原文 | 判断是否需要多处保留 |
| 失效链接 | 指向不存在文件的 Markdown 相对链接 | 修正路径、恢复文件或清理旧引用 |

每项发现都有文件和原始行号。可视化报告进一步说明判断依据和修改建议，不会自动修改文件。

检测支持少量明确的中英文句式。例如 `Use pnpm`、`请使用 pnpm 管理依赖`，以及同动作的 `Always / Never`、`必须 / 禁止`。复杂自然语言语义暂不支持。

**范围会影响判断。** 不同助手、不同标题上下文、父子目录规则，以及激活条件不明的跨文件规则，不会直接视为同一范围的冲突。这种保守策略也可能漏报。

## 常用命令

```bash
# 终端中文报告
node dist/cli.js . --agent codex --lang zh

# 英文示例和可视化报告
node dist/cli.js examples/demo --lang en --html report-en.html

# 程序接口：JSON 不随界面语言变化
node dist/cli.js . --json > findings.json

# CI：存在 warning 时返回退出码 1
node dist/cli.js . --agent codex --strict --json > findings.json

# 排除相对路径，可重复使用
node dist/cli.js . --exclude fixtures --exclude legacy
```

| 参数 | 用途 |
| --- | --- |
| `--agent claude\|codex\|cursor\|copilot` | 选择对应助手的静态来源集合 |
| `--html [file.html]` | 持久保存可视化报告，可另指定一份副本 |
| `--lang en\|zh` | 指定 CLI 和报告初始语言 |
| `--json` | 输出 `schemaVersion: "1.0"` 的稳定 JSON |
| `--strict` | 存在 warning 时返回 1 |
| `--exclude <path>` | 排除相对字面路径，不支持 glob |

HTML 与 JSON 为互斥输出模式。退出码：**0** 完成、**1** 严格检查未通过、**2** 执行或参数错误。JSON 字段名和诊断字符串保持英文，便于集成；终端和可视化界面支持中文。

## 文件支持与限制

支持 `AGENTS.md`、`CLAUDE.md`、`.claude/rules/**/*.md`、`.cursor/rules/**/*.mdc` / `.md`、`.github/copilot-instructions.md` 和 `.github/instructions/**/*.instructions.md`。具体分类和比较策略见 [英文表格](README.md#supported-files)。

- 这是静态检查，无法证明 Codex 实际加载或遵守了哪些规则。
- 首版不扫描全局指令、导入、skills、`AGENTS.override.md` 或自定义 fallback 文件名。
- Markdown / frontmatter 是有限解析；代码示例、注释和已识别条件不会参与冲突判断。
- 同动作冲突需要动作文本匹配，不支持任意改写或翻译之间的语义匹配。
- 链接以指令文件目录为基准，只检查扫描根目录内目标；跳过 URL、绝对路径、图片和模板。
- Token 是启发式估算，不代表真实会话消耗或节省费用；无诊断不代表没有问题。
- 跳过常见依赖/构建目录和符号链接，不自动使用 `.gitignore`；额外路径用 `--exclude`。超过 1 MiB 的指令文件会跳过。

详情见 [规则说明](docs/rules.md)、[JSON Schema](docs/report.schema.json) 和 [验证记录](docs/validation.md)。

## 开发与贡献

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack
```

TypeScript + Node.js，无生产依赖。`dist/index.js` 导出 `lint(root, options)`。

欢迎提交误报、漏报和真实指令样例。提交前请清理私人路径与内容。贡献说明见 [CONTRIBUTING.md](CONTRIBUTING.md)，Issues 可以使用中文或英文。

下一步优先补充真实样例、改进条件解析，以及支持 Codex 的 override/fallback 来源查询。[其他相关工具](docs/market-check.md) 也在探索这一领域。

## 许可证

[MIT](LICENSE)。
