# Detection rules

| ID | Confidence | Match |
| --- | --- | --- |
| `DUPLICATE_RULE` | High | Same normalized rule text, heading context, static scope, and shared agent |
| `PACKAGE_MANAGER_CONFLICT` | Medium | Strictly recognized competing package-manager choices |
| `POLARITY_CONFLICT` | Medium | Matching action text with opposite supported directives |
| `BROKEN_REFERENCE` | High | Missing local relative Markdown link target |

Normalization removes list markers, whitespace differences, and trailing sentence punctuation. It preserves case, negation, paths, and command text. Repeated occurrences can form separate conflict pairs.

English package-manager patterns include `Use pnpm`, `Always use npm for this project`, and the corresponding yarn/bun choices. Chinese patterns include `使用 pnpm`, `请使用 npm 管理依赖`, and supported explicit prefixes. English polarity recognizes `Always` / `Never`; Chinese recognizes positive `始终`, `总是`, `必须`, `务必` and negative `禁止`, `绝不`, `不要`. Action text must match exactly after normalization. The tool does not infer that two paraphrases or two translations mean the same thing.

Rules are candidate prose paragraphs and list items. Original start/end lines are retained. Fenced code, blockquotes, table rows, HTML comments, known example sections, and recognized conditional prose are excluded from conflict checks. A conditional introduction ending with a colon conservatively affects following rules until a new heading. Nested example headings retain the parent condition.

Cross-file comparisons require the same directory scope and heading context, a shared agent, and resolved unconditional activation. Parent/child directories are separate. Conditional files can still produce in-file findings. These choices deliberately trade recall for more interpretable results.

Markdown and YAML parsing are limited rather than complete standards implementations. A finding is a reason to review, not proof of an agent failure. See the tests for supported patterns and counterexamples.
