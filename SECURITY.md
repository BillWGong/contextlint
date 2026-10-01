# Security and trust boundaries

ContextLint treats repository instructions as data. It does not execute commands in them, load repository JavaScript, or call an LLM. Production code uses Node built-ins only.

The scanner reads supported regular files within a canonical scan root, skips symlinks and applies documented resource limits. Root symlinks explicitly supplied by the user are resolved. Report output uses independent local archives, private permissions where supported, and atomic replacement of regular output copies. Output-file symlinks and linked history directories are refused. HTML escapes repository text and restricts executable scripts with a hash-based Content Security Policy. Terminal controls and directional overrides are displayed visibly; JSON preserves the original evidence.

A report is a snapshot, not proof of runtime instruction loading. Unresolved conditions, unreadable files and resource limits are reported. Reports contain source excerpts and paths: exclude `.contextlint/` from version control and review content before sharing. Owner-only file permissions do not provide encryption or defend against another process running as the same user.

The filesystem must not be concurrently modified by a hostile process. Portable Node filesystem APIs do not provide a complete sandbox against all ancestor-directory replacement races. Markdown and frontmatter parsing and natural-language checks are deliberately limited. No security review can guarantee an absence of undiscovered bugs.

When reporting an issue, provide a minimal sanitized reproduction, Node/OS versions and the CLI command. Do not include secrets or private instruction files.
