# MD Comments

Inline, thread-based comments on rendered Markdown inside VS Code, built for doc reviews and AI-assisted editing workflows.

## Start Here (Simple)

### What this is

MD Comments lets you:

- Open a special commentable preview for `.md` files
- Select rendered text and attach threaded comments
- Keep comments out of markdown source content
- Export unresolved comments as structured context for AI tools

Think of it as "docs review comments" for local markdown files, inside VS Code.

### Get started in 2 minutes

1. Install dependencies

```bash
npm install
```

2. Compile

```bash
npm run compile
```

3. Start Extension Development Host from VS Code

- Open this project in VS Code
- Press `F5`

4. Use it on a markdown file

- Open any `.md` file
- Run command: `mdcomments: Open Commentable Preview`
- Select text in the rendered preview and click add comment

### Basic usage flow

1. Open preview for a markdown file
2. Select text in preview
3. Create a thread
4. Reply, edit, resolve, reopen, or delete
5. Run `mdcomments: Copy Unresolved Comments As Context` when you want AI-ready context

## Screenshots

I cannot capture UI screenshots from this terminal-only environment.

If you share screenshots, I can wire them into this README immediately with polished captions.

Suggested screenshot checklist:

1. Commentable preview open with highlighted anchors
2. Selection overlay with existing thread matches
3. Thread pane showing open/resolved/orphaned examples
4. Threads explorer view in activity bar
5. Copied unresolved context JSON snippet

Suggested file names:

- `media/screenshots/01-preview-overview.png`
- `media/screenshots/02-selection-overlay.png`
- `media/screenshots/03-thread-pane.png`
- `media/screenshots/04-explorer-view.png`
- `media/screenshots/05-context-export.png`

## Why this extension exists

Markdown reviews often split feedback across chat, docs, or pull requests.

This extension keeps feedback:

- Anchored to rendered text
- Structured for machine consumption
- Local to your workspace
- Easy to navigate and resolve

## Feature set

- Custom commentable markdown preview webview
- Right-click explorer action to open preview for `.md`
- Thread lifecycle: create, reply, edit, delete, resolve, reopen
- Hover and selection overlays for contextual thread visibility
- Thread explorer grouped by file
- Automatic anchor re-resolution after document edits
- Orphaned thread detection when anchors can no longer be found
- Clipboard export of unresolved comments in deterministic JSON
- Two storage modes: workspace temp or sidecar files

## Install and run

### Option A: Develop locally

```bash
npm install
npm run compile
```

Then press `F5` in VS Code.

### Option B: Package as VSIX

```bash
npm run check
npm run package
```

Install generated `.vsix` via VS Code command:

- Extensions: Install from VSIX...

## How to use (detailed)

### 1) Open commentable preview

Use one of:

- Command palette: `mdcomments: Open Commentable Preview`
- Explorer context menu on a `.md` file
- Editor title action when active file is `.md`

### 2) Add a thread from selected text

In the preview panel:

1. Select rendered text
2. Click add comment action
3. Write comment body
4. Submit

A thread is created and anchored to that selection.

### 3) Work threads

Inside the thread pane you can:

- Jump to thread anchor
- Reply to thread
- Edit or delete a comment
- Resolve thread
- Reopen resolved thread
- Delete entire thread

### 4) Navigate all threads

Use:

- `mdcomments: Show Threads` for a quick pick list in current file
- Activity bar view container `mdcomments` -> `Threads`

### 5) Export unresolved context for AI

Run:

- `mdcomments: Copy Unresolved Comments As Context`

This copies JSON to clipboard for unresolved threads (`open` + `orphaned`).

## Commands reference

| Command | What it does |
| --- | --- |
| `mdcomments: Open Commentable Preview` | Opens the commentable preview for active or selected markdown file |
| `mdcomments: Add Comment From Selection` | Opens preview (if needed) and starts add-comment flow from current selection |
| `mdcomments: Show Threads` | Shows threads in current markdown file and focuses selected one |
| `mdcomments: Resolve/Reopen Thread` | Toggles thread status to resolved or open |
| `mdcomments: Copy Unresolved Comments As Context` | Copies unresolved context JSON from workspace sidecars to clipboard |

## Settings reference

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `mdcomments.storage.mode` | `string` | `workspaceTemp` | Storage backend: `workspaceTemp` or `sidecar` |
| `mdcomments.showResolved` | `boolean` | `true` | Whether resolved threads are shown in preview and explorer |
| `mdcomments.enableTags` | `boolean` | `true` | Enables optional tags metadata on threads |

## Storage model

### Default mode: workspaceTemp

- Sidecar-compatible JSON is written under system temp directory
- Scoped by workspace fingerprint hash
- Keeps repo clean by default

### Sidecar mode: sidecar

- Stores next to markdown file
- Example: `docs/spec.md` -> `docs/spec.mdcomments.json`

Switch mode in settings:

- `mdcomments.storage.mode = sidecar`

Sidecar schema details: [SIDECAR_SCHEMA.md](SIDECAR_SCHEMA.md)

## Data shape for AI context export

Current unresolved export format is a JSON array:

```json
[
	{
		"text": "Quoted markdown text",
		"thread": [
			{
				"author": "local-user",
				"comment": "Please tighten this section"
			}
		]
	}
]
```

This is intentionally compact so it can be pasted directly into AI prompts.

## Thread statuses and anchoring behavior

Thread statuses:

- `open`: active comment thread
- `resolved`: completed thread
- `orphaned`: anchor can no longer be located after edits

Re-anchoring strategy on file changes:

1. Hint-based local exact search
2. Full exact quote search
3. Fuzzy matching fallback
4. Mark as orphaned if unresolved

## Reliability and safety behavior

- Atomic sidecar writes (temp file + rename)
- Schema validation on read/write
- Invalid sidecars are backed up as `.invalid.<timestamp>.bak`
- Markdown rendering blocks raw HTML
- No remote network calls by default

## Troubleshooting

### "mdcomments is enabled only for .md files"

Use a file with `.md` extension.

### Comments disappeared after mode switch

You likely switched storage mode.

- `workspaceTemp` and `sidecar` are separate locations

### A thread became orphaned

The selected quote changed too much during edits.

- Reopen preview and create a new thread at the new location if needed

### Author shows as local-user

Author is derived from local environment user variables.

- If unavailable, fallback is `local-user`

## Development and validation commands

```bash
npm run compile
npm run watch
npm run test:unit
npm run check
npm run package
```

## Packaging and publishing

1. Set your real Marketplace publisher in `package.json` (`publisher` field)
2. Validate and package

```bash
npm run check
npm run package
```

3. Publish

```bash
npm run publish
```

## Project docs

- Product requirements: [PRD.md](PRD.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Sidecar schema: [SIDECAR_SCHEMA.md](SIDECAR_SCHEMA.md)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
