# Live Evidence: Dimension-Mismatch Recreate Parity

Date: 2026-02-15

## Goal
Verify Roo-parity behavior when the existing Qdrant collection dimension does not match the current model dimension.

## How mismatch was forced (repeatable)
Use a temporary override for one run:

```bash
env CODEBASE_SEARCH_SETTINGS_FILE=/home/<user>/Documents/pgit/Roo-Code/.opencode/codebase-search.settings.jsonc \
    CODEBASE_SEARCH_MODEL_DIMENSION=999 \
    opencode run -m openai/gpt-5.3-codex --format json \
    --dir /home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop \
    "Use ONLY the codebase_search tool. Call it with query 'dimension mismatch parity test', mode 'query', and maxResults 1. Return exactly the JSON result."
```

Observed log line:
- `[codebase-search] Collection ws-601a759dd93f4937 dimension mismatch (3072 -> 999). Recreating collection.`

Expected result for this forced run:
- query fails (`{"error":"Bad Request"}`) because embedder output vectors no longer match the temporary override dimension.

## Recovery + parity verification
Run again without override:

```bash
env CODEBASE_SEARCH_SETTINGS_FILE=/home/<user>/Documents/pgit/Roo-Code/.opencode/codebase-search.settings.jsonc \
    opencode run -m openai/gpt-5.3-codex --format json \
    --dir /home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop \
    "Use ONLY the codebase_search tool. Call it with query 'where is password hashing implemented', mode 'query', and maxResults 3. Return exactly the JSON result."
```

Observed:
- mismatch recreate log appears again (`999 -> 3072`)
- `indexing.performed=true`
- `indexing.reason=incremental-index-applied`
- `processedFiles=10`, `indexedBlocks=39`
- results include `src/auth/password.ts`

## Conclusion
Dimension mismatch now recreates the collection and supports recovery by reindexing with the correct dimension, matching Roo's recreate-on-mismatch behavior.
