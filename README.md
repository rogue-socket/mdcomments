# mdcomments

`mdcomments` is a VS Code extension that adds inline, thread-based comments to a custom Markdown preview for `.md` files.

It is designed for doc review workflows where comments need to stay tied to rendered text and remain machine-readable for AI-assisted editing.

## Current implementation

- Commentable preview webview for Markdown files
- Explorer right-click action to open commentable preview directly
- Create/reply/edit/delete/resolve/reopen comment threads
- Selection-aware overlay for existing thread comments in preview
- Default persistence in system temp storage (outside repository)
- Optional sidecar persistence in `<file>.mdcomments.json`
- Anchor re-resolution with orphan handling after markdown edits
- Thread explorer view grouped by file
- In-preview and command-based unresolved-context export for AI workflows

## Quick start

1. Install dependencies

```bash
npm install
```

2. Compile

```bash
npm run compile
```

3. Run unit tests

```bash
npm run test:unit
```

4. Launch extension host from VS Code (`F5`)

## Commands

- `mdcomments: Open Commentable Preview`
- `mdcomments: Add Comment From Selection`
- `mdcomments: Show Threads`
- `mdcomments: Resolve/Reopen Thread`
- `mdcomments: Copy Unresolved Comments As Context`

## Settings

- `mdcomments.storage.mode` (`workspaceTemp` by default, `sidecar` optional)
- `mdcomments.showResolved` (`true` by default)
- `mdcomments.enableTags` (`true` by default)

## Storage

By default (`workspaceTemp`), comments are written outside the repository under a workspace-scoped temp directory.

If you set `mdcomments.storage.mode` to `sidecar`, comments are stored next to markdown files.

## Sidecar format (when using `sidecar` mode)

Comments are stored next to markdown files.

- `docs/spec.md` -> `docs/spec.mdcomments.json`

Schema details are in [SIDECAR_SCHEMA.md](SIDECAR_SCHEMA.md)

## Product spec

The full product requirements document is available at [PRD.md](PRD.md).

## Additional docs

- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
