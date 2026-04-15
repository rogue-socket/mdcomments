# Contributing

## Setup

1. Install dependencies:
   - `npm install`
2. Compile TypeScript:
   - `npm run compile`
3. Run unit tests:
   - `npm run test:unit`
4. Open this workspace in VS Code and press `F5` to launch Extension Development Host

## Development workflow

- Keep store schema changes in `src/comments/schema.ts` backward-aware
- Add/update tests in `test/unit/` when anchor/store/export logic changes
- Prefer small PRs and include before/after behavior notes
- Keep docs synced when adding commands/settings
- Default storage mode is `workspaceState`; use `workspaceTemp` when testing file-backed local persistence outside the repository

## Useful commands

- `mdcomments: Open Commentable Preview`
- `mdcomments: Add Comment From Selection`
- `mdcomments: Show Threads`
- `mdcomments: Resolve/Reopen Thread`
- `mdcomments: Copy Unresolved Comments As Context`

## Release checklist

1. Confirm `CHANGELOG.md` has an entry for the release version
2. Run validation:
   - `npm run check`
   - `npm run package`
3. Ensure `publisher` in `package.json` is set to your Marketplace publisher ID (not `local`)
4. Build package:
   - `npm run package`
