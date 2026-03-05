# Live Evidence: Ignore + Ranking Parity

Date: 2026-02-15

## Goal
- Verify `.ignore` directory exclusion works with Roo-like matching semantics.
- Verify ranking behavior favors code files for code-centric queries while preserving docs-focused query quality.

## Commands

```bash
env CODEBASE_SEARCH_SETTINGS_FILE=/home/<user>/Documents/pgit/Roo-Code/.opencode/codebase-search.settings.jsonc \
    opencode run -m openai/gpt-5.3-codex --format json \
    --dir /home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop \
    "Use ONLY the codebase_search tool. Call it with query 'where are passwords hashed and verified', mode 'query', and maxResults 5. Return exactly the JSON result."

env CODEBASE_SEARCH_SETTINGS_FILE=/home/<user>/Documents/pgit/Roo-Code/.opencode/codebase-search.settings.jsonc \
    opencode run -m openai/gpt-5.3-codex --format json \
    --dir /home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop \
    "Use ONLY the codebase_search tool. Call it with query 'readme semantic queries overview', mode 'query', and maxResults 3. Return exactly the JSON result."
```

## Ranking observations
- Code-centric query now ranks `src/auth/password.ts` above `README.md` even when README has slightly higher raw vector score.
- Docs-focused query (`readme semantic queries overview`) returns `README.md` entries at top positions.
- Returned `score` values remain raw similarity scores.

## `.ignore` directory behavior check
Temporary fixture file:

```text
src/auth/
```

Observed with query-mode run:
- `indexing.deletedFiles=2`
- `src/auth/password.ts` disappeared from results
- index remained queryable and returned remaining matching files

After removing fixture `.ignore` and running query-mode again:
- `indexing.processedFiles=2`
- `indexing.indexedBlocks=4`
- `src/auth/password.ts` returned to top results

## Conclusion
The implementation now honors `.ignore` directory rules with Roo-like slash handling and improves output relevance with code-first ranking for code-oriented searches.
