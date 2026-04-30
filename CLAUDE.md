# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension ("MD Comments") that adds inline comment threads to rendered Markdown previews. Comments are stored locally (not in the markdown source) and anchored to quoted text with fuzzy re-anchoring when the markdown is edited.

## Commands

```bash
npm run compile        # TypeScript → out/
npm run watch          # compile in watch mode
npm run test:unit      # vitest (all unit tests)
npm run check          # compile + unit tests (use before publishing)
npm run package        # build .vsix artifact
npm run publish        # publish to VS Code Marketplace
```

Run a single test file:
```bash
npx vitest run test/unit/anchorEngine.test.ts
```

Manual testing: open the workspace in VS Code, press F5 to launch Extension Development Host.

## Architecture

The extension has three layers connected by a message protocol:

1. **Host side** (`src/`) — runs in the VS Code extension host process (Node/CommonJS).
   - `extension.ts` — activation, command registration, file-save watcher that triggers re-anchoring.
   - `comments/store.ts` — storage backend (workspaceState or workspaceTemp mode). Atomic file writes, schema validation on every read/write, invalid-JSON backup.
   - `comments/schema.ts` — Zod schemas defining threads, comments, and anchors. All store data is validated through these.
   - `comments/anchorEngine.ts` — builds anchors from selections, resolves them against document text. Resolution cascade: hint-based exact → full exact → fuzzy (Dice coefficient) → ordered terms → orphan.
   - `preview/webviewProvider.ts` — owns the webview panel, renders markdown via markdown-it, orchestrates thread CRUD, pushes state to webview.
   - `views/threadTreeProvider.ts` — activity-bar tree view grouped by file → threads.
   - `ai/contextExporter.ts` — exports unresolved threads as deterministic JSON for AI prompts.

2. **Webview frontend** (`media/preview.js`, `media/preview.css`) — runs in an isolated webview iframe. Handles selection tracking, overlay rendering, thread composer UI. Communicates with host exclusively via `postMessage`/`onMessage`.

3. **Message protocol** — webview→host: `requestState`, `refresh`, `createThread`, `replyToThread`, `editComment`, `resolveThread`, `reopenThread`, `deleteThread`, `deleteComment`, `copyContext`. Host→webview: `setState`, `triggerAddFromSelection`, `notify`.

## Key constraints

- Schema changes in `src/comments/schema.ts` must be backward-compatible (existing stored data must still parse).
- Markdown is rendered with `html: false` to prevent injection. Comment text uses `textContent` in the webview.
- No remote calls — everything is local-first.
- Unit tests live in `test/unit/` and cover anchor logic, schema validation, and context export. No VS Code API mocking — tests cover pure logic only.
- No linter configured. Match existing code style.

## Release process

1. Update `CHANGELOG.md` with release notes
2. Bump `version` in `package.json`
3. `npm run check` then `npm run package` then `npm run publish`
4. Verify: `npx --yes @vscode/vsce@3.8.0 show rogue-socket.commentonmd`
5. Commit, tag, push
