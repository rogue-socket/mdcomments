# MD Comments

Inline, thread-based comments on rendered Markdown inside VS Code

MD Comments is built for documentation review workflows where feedback needs to stay anchored to what readers actually see, not raw markdown syntax

## What this extension does

- Opens a dedicated commentable preview for `.md` files
- Lets you select rendered text and create anchored comment threads
- Keeps review comments out of your markdown source files
- Tracks thread lifecycle: reply, edit, resolve, reopen, delete
- Exports unresolved comments as structured JSON for AI-assisted editing

## Typical workflow

1. Open a markdown file
2. Run `mdcomments: Open Commentable Preview`
3. Select text in the preview and create a thread
4. Iterate in the thread pane (reply, edit, resolve, reopen)
5. Run `mdcomments: Copy Unresolved Comments As Context` when you want AI-ready unresolved context

## Why teams use it

- Review feedback stays attached to rendered content
- Comment state is explicit (`open`, `resolved`, `orphaned`)
- Data is local and machine-readable
- No markdown-adjacent comment files are created in your repository

## Core capabilities

- Custom markdown preview webview with inline anchor highlights, including overlapping threads
- Selection overlay that surfaces existing threads for selected text
- Hover overlay that previews nearby thread context
- Activity bar thread explorer (`mdcomments` -> `Threads`)
- Re-anchoring after edits using exact and fuzzy matching
- Orphan detection when anchor text can no longer be resolved
- Deterministic unresolved-context JSON export for AI prompts

## Commands

| Command | Behavior |
| --- | --- |
| `mdcomments: Open Commentable Preview` | Opens commentable preview for the selected or active markdown file |
| `mdcomments: Add Comment From Selection` | Opens preview (if needed) and starts add-comment flow from selection |
| `mdcomments: Show Threads` | Lists threads for current markdown file and focuses the selected thread |
| `mdcomments: Resolve/Reopen Thread` | Toggles selected thread status between resolved and open |
| `mdcomments: Copy Unresolved Comments As Context` | Copies unresolved thread context JSON to clipboard |

## Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `mdcomments.storage.mode` | `string` | `workspaceState` | `workspaceState` stores in VS Code workspace storage, `workspaceTemp` stores under a workspace-scoped temp directory outside your repository |
| `mdcomments.showResolved` | `boolean` | `true` | Controls whether resolved threads are shown in preview and explorer |
| `mdcomments.enableTags` | `boolean` | `true` | Enables optional tag metadata support in thread data |

## Storage model

Default mode is `workspaceState`

- Stores comment data in VS Code extension workspace storage
- No `.mdcomments.json` files are created in your repository
- Good fit for local-only review workflows

Optional mode is `workspaceTemp`

- Stores sidecar-shaped JSON under a workspace-scoped temp directory
- Useful when you want local files that are outside the repository

## AI context output

Unresolved export format is a compact JSON array

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

Only unresolved threads are included (`open` and `orphaned`)

## Scope and limits

- Designed for markdown files only (`.md`)
- Local-first workflow with no remote network calls by default
- Not a real-time multi-user collaboration service

## Reliability and safety

- Atomic writes for file-backed mode (`workspaceTemp`)
- Runtime schema validation on read/write
- Invalid JSON stores are backed up as `.invalid.<timestamp>.bak`
- Markdown rendering disables raw HTML in preview rendering

## More docs

- Sidecar schema: [SIDECAR_SCHEMA.md](SIDECAR_SCHEMA.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Product requirements: [PRD.md](PRD.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Contribution guidelines: [CONTRIBUTING.md](CONTRIBUTING.md)
- Development, packaging, and publishing guide: [DEVELOPMENT.md](DEVELOPMENT.md)
