# Product Requirements Document (PRD)
## Project: mdcomments VS Code Extension

## 1) Document Control
- Version: 1.0
- Date: 2026-04-14
- Status: Draft for implementation kickoff
- Owner: Product + Extension Engineering
- Intended audience: New engineers, designers, QA, and AI-agent workflow builders

## 2) Executive Summary
`mdcomments` is a VS Code extension that enables Google Docs/Confluence-style inline comments on rendered Markdown previews for `.md` files.

A user opens a Markdown preview, selects visible text, and creates a comment thread tied to that selection. These comments are stored in a machine-readable format so humans and AI agents (including GitHub Copilot workflows) can reference intent, change requests, review notes, and unresolved edits.

## 3) Problem Statement
Markdown files are often reviewed in plain text editors where feedback is mixed with source content or kept in separate channels (chat, PR comments, docs). This creates:
- Lost context between a review note and the exact rendered passage
- Friction for non-technical reviewers who think in rendered view, not raw Markdown syntax
- Poor handoff to AI agents because feedback is not stored in a structured, local, queryable format

## 4) Aim (Product Vision)
Enable collaborative, contextual editing feedback directly in Markdown preview, while preserving source file cleanliness and making comments first-class context for automated editing agents.

### Vision statement
For Markdown-heavy workflows, `mdcomments` should become the fastest way to move from “this part should change” to “change request is captured, traceable, and actionable by both humans and AI”.

## 5) Goals and Non-Goals
### Goals
- Support comment threads in preview mode for `.md` files only
- Allow text selection in rendered preview and attach comments to that selection
- Persist comments in a local structured sidecar file for portability and AI consumption
- Keep comments stable across normal document edits via text-anchor re-resolution
- Provide commands to list, navigate, resolve, and export comments context

### Non-Goals (v1)
- Real-time multi-user cloud collaboration
- Rich permissions/roles system
- Support for non-Markdown file types
- Tight coupling to a single AI vendor
- Full replacement of GitHub PR review UX

## 6) Users and Primary Use Cases
### Primary users
- Technical writer reviewing docs changes
- Engineer annotating docs/TODO edits before implementation
- Product manager leaving exact copy edits on docs
- AI-assisted editor workflows needing structured change requests

### Core use cases
- "I want to select a sentence in Markdown preview and add a change request"
- "I want to see unresolved comment threads and jump to each location"
- "I want Copilot/agent to read all unresolved comments and apply edits"
- "I want comments preserved even if nearby text shifts slightly"

## 7) Scope
### In scope (v1)
- `.md` file detection and enablement
- Comment create/read/update/resolve/delete in preview
- Thread metadata (author, timestamps, status, priority/tag optional)
- Sidecar JSON storage in workspace
- Re-anchoring logic on document change/reload
- Command palette actions and optional side view panel
- AI context export command

### Out of scope (v1)
- Team-wide sync backend
- Cross-file comments in one thread
- Attachments, mentions, notifications
- Inline suggestion patch generation in preview UI

## 8) Success Metrics
### Product metrics
- 80%+ of test users can create first comment in under 30 seconds
- 95%+ of comments remain correctly anchored after common edits (insert/delete nearby lines)
- 70%+ reduction in "lost feedback" incidents during doc review (qualitative pilot)

### Engineering metrics
- Preview interaction latency for adding comment: under 100 ms local median
- Extension activation overhead: under 150 ms median for Markdown workflows
- No data loss for comments across VS Code restarts in test scenarios

## 9) Requirements
## 9.1 Functional Requirements
### FR-1 File gating
- Extension comment features activate only for `.md` files
- Non-`.md` files show disabled state with reason

### FR-2 Comment creation from preview selection
- User can select rendered text in preview
- User can trigger "Add Comment" via context action or shortcut
- User enters comment text and submits
- New thread appears anchored to selection

### FR-3 Comment thread lifecycle
- Add replies to existing thread
- Edit own comment text
- Resolve/reopen thread
- Delete comment/reply with confirmation

### FR-4 Comment navigation
- Side panel/quick pick lists comments by file and status
- Click thread jumps preview to anchored segment
- Optional jump to source Markdown line if available

### FR-5 Persistence format
- Comments stored in sidecar JSON file associated with target Markdown file
- Format is deterministic and stable for tooling
- Includes anchor data, content, status, timestamps, and ids

### FR-6 Re-anchoring logic
- On file changes, extension attempts to re-locate original anchor using text quote + context
- If exact match fails, fallback fuzzy strategy attempts nearest semantic match
- If unresolved, mark thread as "orphaned" and show remediation option

### FR-7 AI/agent context export
- Command: "mdcomments: Copy unresolved comments as context"
- Command: "mdcomments: Open unresolved comments JSON"
- Optional virtual document provider for easy AI consumption

### FR-8 Basic filtering
- Filter by status: open/resolved/orphaned
- Filter by tag/priority if enabled

### FR-9 Workspace portability
- Sidecar files are plain text JSON and can be committed to git
- Team can share comment context through repository history

## 9.2 Non-Functional Requirements
### NFR-1 Performance
- No noticeable typing lag in Markdown editor
- Preview scripts must avoid full re-render on small operations where possible

### NFR-2 Reliability
- Atomic write behavior for comment save
- Recover gracefully from malformed sidecar file (backup + validation error)

### NFR-3 Security
- Treat Markdown preview content as untrusted
- Sanitize any rendered/echoed user input in comment UI
- No remote network calls by default in v1

### NFR-4 Accessibility
- Keyboard-only support for comment actions
- Focus order and ARIA labels for thread UI
- Color contrast meets WCAG AA in default theme contexts

### NFR-5 Privacy
- Comments stored locally in workspace
- Telemetry (if enabled later) must be opt-in and content-redacted

## 10) UX Requirements
### UX principles
- "Select -> Comment" must feel instant and obvious
- Thread UI should be lightweight, non-intrusive, and easy to dismiss
- Unresolved comments should remain discoverable without clutter

### Primary flow
1. User opens `.md` file
2. User opens mdcomments preview
3. User highlights text in rendered preview
4. User clicks add comment action
5. User submits thread
6. Thread marker appears inline; thread listed in side panel
7. User resolves/reopens after edits

### Empty and error states
- No comments yet: show guided CTA
- Anchor lost: show "orphaned" badge with "re-anchor" action
- Invalid sidecar: show recover/backup prompt

## 11) Technical Stack
### Language and runtime
- TypeScript
- Node.js runtime for extension host
- VS Code Extension API

### Core libraries
- `markdown-it` for controlled rendering pipeline in webview
- `uuid` or `nanoid` for deterministic id generation approach (final pick in implementation)
- `zod` (or JSON schema validator) for sidecar schema validation
- `fast-diff` (optional) for anchor repair heuristics

### Testing/tooling
- `@vscode/test-electron` for integration tests
- `vitest` for unit tests (anchor matching, schema validation)
- ESLint + Prettier for code quality consistency

## 12) Architecture and Approach Decision
### Options considered
- Option A: Extend built-in Markdown preview directly with scripts/plugins
- Option B: Custom mdcomments preview webview dedicated to commentable rendering

### Decision
Choose **Option B (custom preview webview) for v1**, with a later bridge to built-in preview if needed.

### Why this decision
- Full control over selection, thread markers, and UI interactions
- Cleaner message channel between webview and extension host
- Lower risk than relying on built-in preview extension points for complex interaction patterns
- Easier to evolve toward richer commenting features

### Tradeoffs
- Slight UX difference from native preview behavior
- Requires separate preview command/open mode

### High-level components
- Extension Host:
  - Registers commands, manages lifecycle, persistence, re-anchoring
- Commentable Preview Webview:
  - Renders Markdown, captures selections, displays thread markers
- Comment Store:
  - Reads/writes sidecar JSON with validation and backup
- Anchor Engine:
  - Resolves and repairs selection anchors after file edits
- AI Context Provider:
  - Exports unresolved comments in deterministic structured format

## 13) Data Model (Sidecar)
### Storage location
- Default: alongside Markdown file as `<filename>.mdcomments.json`
- Configurable later to central `.mdcomments/` directory

### Example schema (v1)
```json
{
  "version": 1,
  "targetFile": "docs/spec.md",
  "updatedAt": "2026-04-14T10:00:00.000Z",
  "threads": [
    {
      "id": "thr_01",
      "status": "open",
      "anchor": {
        "quote": "This section needs clearer acceptance criteria",
        "prefix": "Overview:",
        "suffix": "Implementation Notes",
        "startHint": 482,
        "endHint": 530
      },
      "createdBy": "local-user",
      "createdAt": "2026-04-14T09:55:00.000Z",
      "resolvedAt": null,
      "comments": [
        {
          "id": "c_01",
          "author": "local-user",
          "body": "Please split this into measurable criteria",
          "createdAt": "2026-04-14T09:55:00.000Z",
          "editedAt": null
        }
      ],
      "tags": ["copy", "acceptance"],
      "priority": "medium"
    }
  ]
}
```

## 14) Commands, Settings, and Contributions
### Commands (initial)
- `mdcomments.openCommentablePreview`
- `mdcomments.addCommentFromSelection`
- `mdcomments.showThreads`
- `mdcomments.resolveThread`
- `mdcomments.copyUnresolvedContext`

### Settings (initial)
- `mdcomments.storage.mode`: `workspaceState` (alternatives: `workspaceTemp`, `sidecar`)
- `mdcomments.showResolved`: boolean
- `mdcomments.enableTags`: boolean

### VS Code contribution points
- Commands + keybindings
- Views container for thread explorer
- Context menus for Markdown editor/preview actions

## 15) Verification Criteria (Definition of Success)
A release candidate is acceptable only if all criteria below are met.

### Acceptance criteria
- AC-1: User can add a comment from selected preview text in `.md` file
- AC-2: Comment persists after window reload/restart
- AC-3: User can resolve and reopen thread
- AC-4: Re-anchoring succeeds for at least 95% of standard edit fixtures
- AC-5: Orphaned anchors are clearly surfaced and recoverable
- AC-6: "Copy unresolved comments as context" outputs valid structured text/JSON
- AC-7: Non-`.md` files do not expose active comment actions

### Test matrix
- Unit tests:
  - Anchor matching/recovery
  - Schema validation and migrations
  - Store read/write and backup behavior
- Integration tests:
  - Command flows across editor + preview
  - Thread lifecycle state transitions
- Manual QA:
  - Keyboard-only navigation
  - Theme compatibility (light/dark/high contrast)
  - Large Markdown file performance sanity checks

## 16) Implementation Plan (For New Contributors)
## 16.1 Recommended repository structure
```text
src/
  extension.ts
  commands/
  preview/
    webviewProvider.ts
    renderer/
  comments/
    store.ts
    schema.ts
    anchorEngine.ts
  ai/
    contextExporter.ts
  views/
    threadTreeProvider.ts
test/
  unit/
  integration/
media/
  preview.js
  preview.css
```

## 16.2 Milestones
- M1: Scaffold extension + command wiring + commentable preview shell
- M2: Comment CRUD + sidecar persistence + basic thread list view
- M3: Anchor repair engine + orphan handling + tests
- M4: AI context export + polish + accessibility pass
- M5: RC hardening + docs + marketplace packaging readiness

## 16.3 First-week starter tasks
- Setup extension project skeleton with TypeScript
- Implement basic preview webview rendering for active `.md` file
- Implement selection capture and create-thread modal
- Persist minimal thread schema to sidecar JSON
- Add command to print unresolved threads in output/channel

## 17) Risks and Mitigations
- Risk: Anchor drift after significant rewrites
  - Mitigation: Quote+context anchoring, fuzzy fallback, orphan workflow
- Risk: UX confusion between native preview and commentable preview
  - Mitigation: Clear command names, onboarding tooltip, status bar indicator
- Risk: Corrupted sidecar files
  - Mitigation: Schema validation + automatic backup and recovery path
- Risk: Performance on very large docs
  - Mitigation: Incremental rendering updates and lightweight marker painting

## 18) Operational and Documentation Requirements
### Mandatory docs to maintain
- README: quick start + command list
- PRD (this file): product and technical source of truth
- CONTRIBUTING: setup, coding conventions, test commands
- CHANGELOG: feature and schema evolution
- Sidecar schema reference with versioning notes

### Versioning policy
- Sidecar format uses explicit `version`
- Breaking schema changes require migration function + migration tests

## 19) Open Questions
- Should sidecar be colocated with file or centralized under `.mdcomments/` by default?
- Should comment author identity be sourced from git config, VS Code profile, or manual setting?
- Should we support inline suggested replacement text in v1.1?

## 20) Definition of Done (v1)
- All acceptance criteria pass
- Required docs are present and reviewed
- Integration tests pass in CI
- Extension can be installed locally and used on sample Markdown files
- AI context export produces stable, parseable output for agent prompts

## 21) Immediate Next Step
Start M1 implementation and create an `ARCHITECTURE.md` that maps this PRD to concrete modules/classes and command contracts
