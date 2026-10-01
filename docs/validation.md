# Validation

Local validation uses Node.js 24 and TypeScript 5.9.3. The repository CI matrix covers Node.js 22 and 24 on Linux, macOS, and Windows; the GitHub workflow badge shows the current result.

The test suite covers source lines, conflict counterexamples, repeated rules, heading and directory scopes, agent filtering, local references, exclusions, symlinks, Chinese directives, CRLF/frontmatter, size limits, exit codes, JSON Schema, HTML escaping, and interface language selection. Tests are the source of truth for current coverage.

The HTML report has also been opened in Safari to check layout, filtering, searching, and both language interfaces. That is a manual UI check, not a cross-browser guarantee.

A static scan of [ai-context-kit](https://github.com/ofershap/ai-context-kit) at commit `40d552b2e92a3ed9922eae2227b7f72ed945f2f9` found one Cursor rule file and no supported findings. No code from that repository was executed. This was a smoke test of scanning and output, not a precision/recall benchmark.

More annotated real-world repositories are needed before making accuracy claims. Token counts remain estimates; clean reports are not correctness guarantees.
