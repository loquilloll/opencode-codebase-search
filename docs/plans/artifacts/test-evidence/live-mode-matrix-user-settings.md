# Live Evidence: Mode Matrix with User Settings

Date: 2026-02-15

Settings file used for all runs:
- `/home/<user>/Documents/pgit/Roo-Code/.opencode/codebase-search.settings.jsonc`

Workspace used:
- `/home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop`

Precondition:
- fixture initialized as its own git repo (`git init`) so `context.worktree` maps to fixture, not parent Roo-Code repo.

Model used:
- `openai/gpt-5.3-codex`

## Disabled mode
Command intent:
- query: `password hashing and verification`
- mode override: `disabled`

Observed tool JSON fields:
- `mode`: `disabled`
- `indexing.reason`: `search-only-existing-index`
- `results`: non-empty and scoped to fixture files (example: `README.md`, `scripts/load_demo_data.py`)

## Query mode
Command intent:
- query: `where is password hashing implemented`
- mode override: `query`

Observed tool JSON fields:
- `mode`: `query`
- `indexing.reason`: `adopted-existing-roo-index-reconciled`
- `processedFiles`: `10`
- `skippedFiles`: `0`
- `indexedBlocks`: `39`
- `results`: non-empty
- top hit includes `src/auth/password.ts` with `hashPassword` and `verifyPassword`

Interpretation:
- Query mode reconciled against existing Roo collection without duplicating collection state, then returned fixture-relevant code hits.

## Background mode
Command intent:
- query: `payment retry exponential backoff`
- mode override: `background`

Observed tool JSON fields:
- `mode`: `background`
- `indexing.triggered`: `true`
- `indexing.reason`: `background-refresh-scheduled`
- `results`: non-empty

Interpretation:
- Background mode is non-blocking and schedules refresh while returning current results.

## Notes
- Running from a subdirectory without its own `.git` caused `worktree` to resolve to parent repo and returned unrelated hits from Roo-Code.
- Fix: ensure fixture is standalone git root before validation.

## Additive parity rerun note
- A later tmux-driven rerun (same fixture + settings) reconfirmed all three mode behaviors after ignore/ranking parity updates.
- See `docs/plans/artifacts/test-evidence/live-mode-matrix-tmux-user-settings.md` for the rerun details and captured indexing fields.
