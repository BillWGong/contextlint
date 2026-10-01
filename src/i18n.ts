import type { Finding } from './types.js';
export type Language = 'en' | 'zh';
export function resolveLanguage(explicit?: string, env: NodeJS.ProcessEnv = process.env): Language {
  if (explicit === 'en' || explicit === 'zh') return explicit;
  return /^zh(?:[_-]|$)/i.test(env.LC_ALL || env.LC_MESSAGES || env.LANG || '') ? 'zh' : 'en';
}
export const en = {
  title: 'ContextLint · Instruction review', tagline: 'Clear instructions. Visible evidence.',
  overview: 'Overview', issues: 'Findings & suggestions', sources: 'Instruction sources',
  project: 'Project', allAgents: 'All agents', review: 'Instruction review', headline: 'findings to review', zeroHeadline: 'No supported issues found',
  subtitle: 'Read the evidence before editing. Every finding includes source locations, detection details, and a suggested next step.',
  zeroSubtitle: 'No supported checks matched. Complex conditions and instruction meaning still need human review.',
  conflicts: 'Potential conflicts', duplicates: 'Duplicate rules', references: 'Broken references', files: 'Instruction files',
  conflictNote: 'Counted as pairs · Check conditions', duplicateNote: 'Counted as groups', referenceNote: 'Local link target not found',
  tokenNote: 'estimated tokens · Not session usage', all: 'All', conflict: 'Conflicts', duplicate: 'Duplicates', reference: 'References',
  search: 'Search files or instruction text…', high: 'High confidence', medium: 'Needs review', line: 'Line', location: 'Source',
  fix: 'Suggested next step', evidence: 'Detection details', empty: 'No findings match this filter.', emptyNote: 'No findings does not mean no issues.',
  sourceTitle: 'Files checked', rules: 'candidate rules', directory: 'Directory scope', conditional: 'Activation unresolved',
  noFiles: 'No supported instruction files found.', how: 'Reading this report',
  step1: '01 Read both instructions', step1Text: 'Check whether they describe the same scenario.',
  step2: '02 Look for missing conditions', step2Text: 'A difference may be an intentional exception.',
  step3: '03 Edit, then scan again', step3Text: 'This report never edits your files.', limits: 'scan or analysis limitations',
  footer: 'ContextLint · Static checks cannot prove what an agent loaded or followed. Detection is limited; token counts are estimates.',
  warning: 'warning', info: 'info', found: 'Found', tokens: 'estimated tokens', ruleCount: 'rules', skipped: 'Skipped / limited analysis', reason: 'Reason',
  terminalFooter: 'Static file analysis only. Token counts are estimates; review findings before editing.',
  saved: 'Visual report saved', history: 'History copy', open: 'Open saved report', language: 'Report language', error: 'Could not complete the scan',
  help: 'Usage: contextlint [directory] [options]', helpAgent: 'Check sources for one agent', helpJson: 'Output versioned JSON',
  helpHtml: 'Save a persistent visual report; optional additional output path', helpLang: 'Choose output language (default: locale, then English)',
  helpStrict: 'Exit 1 for warning findings', helpExclude: 'Exclude a literal path (repeatable)', helpHelp: 'Show help', helpVersion: 'Show version',
  exitCodes: 'Exit codes: 0 completed; 1 strict threshold reached; 2 execution/usage error.',
  requiresValue: 'requires a value', unknownAgent: 'Unknown agent', unknownOption: 'Unknown option', oneDirectory: 'Only one directory can be scanned',
  incompatible: '--json and --html cannot be combined', htmlExtension: '--html output must end with .html', unknownLanguage: 'Language must be en or zh',
  symLink: 'Symbolic links are not followed', excluded: 'Explicitly excluded', large: 'Instruction file exceeds the 1 MiB limit',
  unresolved: 'Activation conditions are unresolved; cross-file comparisons disabled'
};
export const zh: Record<keyof typeof en, string> = {
  title: 'ContextLint · 指令检查报告', tagline: '指令更清楚，依据看得见', overview: '检查概览', issues: '问题与建议', sources: '指令来源',
  project: '项目', allAgents: '全部助手', review: '指令检查', headline: '项发现值得检查', zeroHeadline: '本次未发现已支持的问题',
  subtitle: '先看原文，再决定怎么修改。每一项都保留了来源位置、检测依据与修改建议。',
  zeroSubtitle: '当前规则没有匹配到问题。复杂条件和语义仍需人工检查。',
  conflicts: '潜在冲突', duplicates: '重复规则', references: '失效引用', files: '指令文件',
  conflictNote: '按冲突对计数 · 需确认条件', duplicateNote: '按重复组计数', referenceNote: '未找到本地链接目标',
  tokenNote: '估算 tokens · 非会话用量', all: '全部', conflict: '冲突', duplicate: '重复', reference: '引用',
  search: '搜索文件或原文…', high: '高置信度', medium: '需要人工确认', line: '行', location: '来源',
  fix: '建议修改', evidence: '查看检测依据', empty: '当前筛选下没有发现。', emptyNote: '未发现不等于已验证无问题。',
  sourceTitle: '检查了哪些文件', rules: '条候选规则', directory: '目录范围', conditional: '激活条件未解析',
  noFiles: '没有找到支持的指令文件。', how: '如何阅读这份报告',
  step1: '01 看两段原文', step1Text: '确认是否用于同一场景。', step2: '02 检查缺失的条件', step2Text: '有些差异可能是有意的例外。',
  step3: '03 修改后重新扫描', step3Text: '报告不会自动修改你的文件。', limits: '项扫描或分析限制',
  footer: 'ContextLint · 静态检查无法证明助手实际加载或遵守了哪些规则。检测能力有限，token 数为估算。',
  warning: '警告', info: '提示', found: '发现', tokens: '估算 tokens', ruleCount: '条规则', skipped: '跳过项 / 分析限制', reason: '依据',
  terminalFooter: '仅进行静态文件分析。Token 数为估算，修改前请审查诊断结果。',
  saved: '可视化报告已保存', history: '历史副本', open: '打开已保存报告', language: '报告语言', error: '未能完成扫描',
  help: '用法：contextlint [目录] [选项]', helpAgent: '只检查指定助手的来源', helpJson: '输出版本化 JSON',
  helpHtml: '持续保存可视化报告，可指定额外输出路径', helpLang: '选择输出语言（默认按系统语言，否则使用英语）',
  helpStrict: '存在警告时返回退出码 1', helpExclude: '排除指定相对路径（可重复使用）', helpHelp: '显示帮助', helpVersion: '显示版本',
  exitCodes: '退出码：0 完成；1 触发严格检查阈值；2 执行或参数错误。',
  requiresValue: '需要提供参数值', unknownAgent: '未知助手', unknownOption: '未知选项', oneDirectory: '一次只能扫描一个目录',
  incompatible: '--json 和 --html 不能同时使用', htmlExtension: '--html 输出文件必须以 .html 结尾', unknownLanguage: '语言必须为 en 或 zh',
  symLink: '不跟随符号链接', excluded: '已按参数排除', large: '指令文件超过 1 MiB 上限', unresolved: '激活条件未解析，已禁用跨文件比较'
};
export const words = (language: Language) => language === 'zh' ? zh : en;
type Description = { title: string; why: string; fix: string; reason: string; category: string };
const english: Record<Finding['id'], Description> = {
  PACKAGE_MANAGER_CONFLICT: { title: 'Competing package-manager choices', why: 'Different package managers are selected within the same static scope. Installing or updating dependencies may become ambiguous.', fix: 'Check the project lockfile and choose the intended package manager. If the choices belong to different subprojects, make those conditions explicit.', reason: 'Explicit incompatible statements share an agent, heading context, and static scope. Runtime loading and precedence are not inferred.', category: 'conflict' },
  POLARITY_CONFLICT: { title: 'The same action is required and forbidden', why: 'These instructions give opposite directions for the same action. Check whether a condition or exception is missing.', fix: 'Confirm the intended behavior and keep the matching rule. If both rules are valid in different situations, write those conditions explicitly.', reason: 'Matching action text uses opposite supported directives in the same agent, heading context, and static scope.', category: 'conflict' },
  DUPLICATE_RULE: { title: 'A rule appears more than once', why: 'The instructions match after ignoring list markers, whitespace differences, and trailing sentence punctuation.', fix: 'Check whether both copies are needed. Within the same scope, one clear instruction may be easier to maintain.', reason: 'Normalized rule text matches in the same static scope and heading context for a shared agent.', category: 'duplicate' },
  BROKEN_REFERENCE: { title: 'A local reference is missing', why: 'A Markdown link points to a file that could not be found relative to the instruction file.', fix: 'Update the relative path, restore the file, or remove the outdated reference.', reason: 'A relative Markdown link was resolved from the instruction file directory within the scan root, but the target was not found.', category: 'reference' }
};
const chinese: Record<Finding['id'], Description> = {
  PACKAGE_MANAGER_CONFLICT: { title: '包管理器选择不一致', why: '同一适用范围内出现了不同的包管理器选择，执行安装或更新依赖时可能产生歧义。', fix: '结合 lockfile 确定项目使用的包管理器，再统一这些指令。若用于不同子项目，请明确写出适用条件。', reason: '明确的不兼容声明具有相同助手、标题上下文和静态范围。未推断运行时加载或优先级。', category: 'conflict' },
  POLARITY_CONFLICT: { title: '同一个动作被同时要求和禁止', why: '这些原文对相同动作给出了相反要求，需要确认是否遗漏了条件或例外。', fix: '确认你期望的行为，保留对应规则；如果两者适用于不同场景，请分别补充条件。', reason: '相同助手、标题上下文和静态范围内，匹配的动作文本使用了相反的明确要求。', category: 'conflict' },
  DUPLICATE_RULE: { title: '同一条规则重复出现', why: '忽略列表符号、空白和句末标点后，这些规则一致。', fix: '检查是否需要多处保留。对于同范围的重复条目，可以保留一份清晰的表述。', reason: '相同静态范围和标题上下文中，共享助手的规则文本在归一化后相同。', category: 'duplicate' },
  BROKEN_REFERENCE: { title: '引用的本地文件不存在', why: '按指令文件所在目录解析 Markdown 链接，未找到对应文件。', fix: '将链接更新为正确的相对路径，恢复文件，或删除已经过时的引用。', reason: '在扫描根目录内，按指令文件所在目录解析 Markdown 相对链接，未找到目标。', category: 'reference' }
};
export const describeFinding = (id: Finding['id'], language: Language) => (language === 'zh' ? chinese : english)[id];
export function skipReason(reason: string, language: Language): string {
  const w = words(language);
  if (reason.startsWith('Activation conditions')) return w.unresolved;
  return ({ 'Symbolic links are not followed': w.symLink, 'Explicitly excluded': w.excluded, 'Instruction file exceeds 1 MiB limit': w.large })[reason] ?? reason;
}
