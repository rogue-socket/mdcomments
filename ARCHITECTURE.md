# mdcomments Architecture

This document maps the PRD to concrete modules, contracts, and runtime behavior for the v1 implementation.

## Module map

- `src/extension.ts`
  - Extension activation entrypoint
  - Registers commands, tree view, and lifecycle hooks
- `src/preview/webviewProvider.ts`
  - Owns the commentable markdown preview webview panel
  - Handles host<->webview message contracts
  - Orchestrates thread CRUD and re-render
- `src/comments/store.ts`
  - Storage path resolution for `workspaceTemp` and `sidecar` modes
  - Sidecar read/write with validation and atomic writes
  - Invalid sidecar backup for recovery
- `src/comments/schema.ts`
  - Zod schema for sidecar data model
  - Runtime validation and strong TS types
- `src/comments/anchorEngine.ts`
  - Quote/context anchor construction
  - Exact + fuzzy re-resolution after markdown edits
  - Orphan marking behavior
- `src/views/threadTreeProvider.ts`
  - `mdcomments.threads` explorer model
  - Grouping by markdown file with thread children
- `src/ai/contextExporter.ts`
  - Deterministic unresolved-thread export payload for AI workflows
- `media/preview.js`
  - Webview frontend controller (selection, overlay, thread UI, actions)
- `media/preview.css`
  - Webview styling and responsive layout

## Command contracts

- `mdcomments.openCommentablePreview`
  - Opens/refreshes commentable preview for active or supplied markdown URI
  - Optional argument: thread id to focus
  - Available from explorer right-click for `.md` files
- `mdcomments.addCommentFromSelection`
  - Opens preview (if needed) and triggers add-from-selection in webview
- `mdcomments.showThreads`
  - Quick pick thread list for active markdown file
  - Selection opens preview focused on chosen thread
- `mdcomments.resolveThread`
  - Toggle resolve/reopen by explicit thread id or quick pick
- `mdcomments.copyUnresolvedContext`
  - Builds unresolved context JSON across workspace sidecars
  - Copies output to clipboard

## Data flow

1. User opens markdown preview via command
2. Host reads markdown source + sidecar
3. Host runs re-anchor pass and persists changed anchors/statuses
4. Host renders markdown HTML via `markdown-it`
5. Host sends `setState` payload to webview
6. Webview captures selection and posts CRUD events
7. Selection on existing anchors opens an inline comment overlay
8. Host mutates sidecar, persists atomically, and pushes refreshed state
9. Thread tree provider refreshes to keep explorer in sync

## Message protocol

Webview -> host:
- `requestState`
- `refresh`
- `createThread`
- `replyToThread`
- `editComment`
- `resolveThread`
- `reopenThread`
- `deleteThread`
- `deleteComment`
- `copyContext`

Host -> webview:
- `setState`
- `triggerAddFromSelection`
- `notify`

## Re-anchoring behavior

- Anchor has quote + prefix/suffix + index hints
- Resolution order:
  1. Hint-based local exact scan
  2. Full exact quote scan
  3. Fuzzy scan using Dice coefficient on candidate windows
- If unresolved:
  - thread marked `orphaned` (unless already `resolved`)
  - `currentStart/currentEnd` cleared

## Reliability choices

- Sidecar writes use temp-file then rename for atomicity
- Invalid sidecars are backed up to `*.invalid.<timestamp>.bak`
- Sidecar content is schema-validated on every read/write
- Default storage keeps comment files out of git repositories via workspace-scoped temp directory

## Security notes

- Markdown is rendered with `html: false` to avoid raw HTML injection
- Comment text is rendered in webview using `textContent`
- No remote calls are performed by default
