# Live Evidence: Adoption Reconciliation

Date: 2026-02-15

## Goal
Verify that when a Roo index collection already exists but local cache is missing, query mode performs one-time reconciliation instead of a no-op adoption.

## Procedure
1. Remove fixture cache file:
   - `.opencode/codebase-search/ws-601a759dd93f4937.cache.json`
2. Run query-mode `codebase_search` in fixture workspace using user settings:
   - workspace: `/home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop`
   - settings: `/home/<user>/Documents/pgit/Roo-Code/.opencode/codebase-search.settings.jsonc`
   - query: `where is password hashing implemented`

## Observed Output
- `indexing.reason`: `adopted-existing-roo-index-reconciled`
- `performed`: `true`
- `triggered`: `true`
- `processedFiles`: `10`
- `indexedBlocks`: `39`
- `deletedFiles`: `0`
- top result: `src/auth/password.ts` including `hashPassword`/`verifyPassword`

## Conclusion
Adoption now reconciles index content and avoids the prior stale/no-op behavior, while still reusing the existing Roo collection.
