# Live Smoke Evidence: Mode Matrix (Fast-Fail Fixture)

Date: 2026-02-15

## Purpose
Verify mode-specific behavior quickly using a deterministic settings file pointing to an unreachable local Qdrant URL (`http://127.0.0.1:1`).

Fixture workspace:
- `docs/plans/artifacts/test-fixtures/mini-shop`

Model:
- `openai/gpt-5.3-codex`

Prompt:
- `Use ONLY the codebase_search tool. Query: password hashing and verification. Return top 3 hits.`

## Settings Files
- `docs/plans/artifacts/test-evidence/settings-mode-disabled-fast.jsonc`
- `docs/plans/artifacts/test-evidence/settings-mode-query-fast.jsonc`
- `docs/plans/artifacts/test-evidence/settings-mode-background-fast.jsonc`

## Results

### disabled
Observed tool output:
```json
{
  "query": "password hashing and verification",
  "mode": "disabled",
  "path": null,
  "indexing": {
    "mode": "disabled",
    "performed": false,
    "triggered": false,
    "reason": "no-existing-index"
  },
  "results": []
}
```

Interpretation:
- Search path executed without indexing.
- No existing index was available, as expected.

### query
Observed behavior:
- Tool path failed with connectivity error during indexing:
  - `Unable to connect. Is the computer able to access the url?`

Interpretation:
- Query mode attempts synchronous indexing before search.
- Connectivity failure is surfaced immediately.

### background
Observed tool output:
```json
{
  "query": "password hashing and verification",
  "mode": "background",
  "path": null,
  "indexing": {
    "mode": "background",
    "performed": false,
    "triggered": true,
    "reason": "background-refresh-scheduled"
  },
  "results": []
}
```

Additional logs:
- Background worker emitted:
  - `[codebase-search] Background indexing failed: Unable to connect. Is the computer able to access the url?`

Interpretation:
- Search response remained non-blocking.
- Background refresh was scheduled and failed independently, matching desired behavior.
