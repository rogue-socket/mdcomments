# Sidecar Schema v1

This schema applies when `mdcomments.storage.mode` is set to `sidecar`.

Each markdown file stores comments in a sibling JSON file:

- Markdown: `docs/spec.md`
- Sidecar: `docs/spec.mdcomments.json`

## Schema

```json
{
  "version": 1,
  "targetFile": "docs/spec.md",
  "updatedAt": "2026-04-14T10:00:00.000Z",
  "threads": [
    {
      "id": "thr_x",
      "status": "open",
      "anchor": {
        "quote": "selected text",
        "prefix": "left context",
        "suffix": "right context",
        "startHint": 128,
        "endHint": 141,
        "currentStart": 128,
        "currentEnd": 141
      },
      "createdBy": "local-user",
      "createdAt": "2026-04-14T09:55:00.000Z",
      "resolvedAt": null,
      "comments": [
        {
          "id": "c_x",
          "author": "local-user",
          "body": "Please clarify this section",
          "createdAt": "2026-04-14T09:55:00.000Z",
          "editedAt": null
        }
      ],
      "tags": ["copy"],
      "priority": "medium"
    }
  ]
}
```

## Notes

- `status` values: `open`, `resolved`, `orphaned`
- `currentStart/currentEnd` can become `null` when anchor is orphaned
- `version` is required for future migrations
- Default mode is `workspaceTemp`, which stores the same schema under a workspace-scoped temp directory instead of the repo
