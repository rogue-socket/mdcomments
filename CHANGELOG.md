# Changelog

## 0.0.7 - 2026-04-16

- Fixed anchoring for non-contiguous table column selections so multi-row selections no longer save as orphaned in common cases
- Fixed preview highlight matching for numbered-list selections when quotes include rendered list markers

## 0.0.6 - 2026-04-16

- Added `workspaceState` storage mode using VS Code workspace storage so comments stay out of repository files by default
- Changed default `mdcomments.storage.mode` to `workspaceState`
- Added automatic migration fallback across `workspaceState`, `sidecar`, and `workspaceTemp` when loading comments for a file

## 0.0.5 - 2026-04-16

- Fixed visible highlights for selections spanning multiple elements (headings, lists, and table rows)
- Improved cross-node text matching by preserving boundary spacing in preview highlight indexing
- Applied highlight rendering per text segment to keep highlights visible across element boundaries

## 0.0.4 - 2026-04-15

- Fixed missing comments/threads across devices by making sidecar storage the default mode
- Added storage fallback and migration path to recover existing temp-stored threads
- Fixed thread creation to persist as orphaned instead of silently failing when exact source anchoring is not possible
- Improved preview highlight reliability by preserving selected quote text in anchors

## 0.0.3 - 2026-04-15

- Fixed thread highlight rendering when selected text spans multiple inline elements
- Improved highlight matching for repeated quotes by using anchor prefix/suffix context
- Improved text normalization for punctuation and whitespace to reduce cross-device highlight drift

## 0.0.2 - 2026-04-15

- Added explorer right-click action to open commentable preview for markdown files
- Redesigned preview UI with a cleaner dark theme and improved markdown readability
- Added selection overlay that shows existing thread comments near selected text
- Added in-preview context copy action with simplified unresolved context JSON format
- Added `workspaceTemp` storage mode and made it the default so comments stay out of the repository

## 0.0.1 - 2026-04-14

- Initial project scaffold for mdcomments extension
- Added custom markdown commentable preview webview
- Added sidecar persistence with validation and backup handling
- Added anchor re-resolution (exact + fuzzy) and orphan state handling
- Added thread explorer and command palette workflows
- Added unresolved comment context export for AI workflows
- Added baseline unit tests and architecture documentation
