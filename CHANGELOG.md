# Changelog

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
