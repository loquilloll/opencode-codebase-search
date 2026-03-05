# Live Evidence: tmux-cli Mode Matrix with User Settings

Date: 2026-02-15

## Setup
- User-confirmed workspace open in Roo-Code: `/home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop`
- Settings file used: `/home/<user>/Documents/pgit/Roo-Code/.opencode/codebase-search.settings.jsonc`
- tmux orchestration: remote mode via `tmux-cli`
- Server URL from capture: `http://127.0.0.1:46013`

## Captured Artifacts
- `docs/plans/artifacts/test-evidence/tmux-disabled.jsonl`
- `docs/plans/artifacts/test-evidence/tmux-query.jsonl`
- `docs/plans/artifacts/test-evidence/tmux-background.jsonl`

## Server Capture Notes
- Initial fixed-port attempt failed (`4096` already in use).
- Random-port startup succeeded:
  - `opencode server listening on http://127.0.0.1:46013`

## Mode Results

### disabled
From `tmux-disabled.jsonl`:
- Tool invoked: `codebase_search`
- Input mode: `disabled`
- Indexing: `performed=false`, `triggered=false`, `reason=search-only-existing-index`
- Results: non-empty (`README.md` top hits)

### query
From `tmux-query.jsonl`:
- Tool invoked: `codebase_search`
- Input mode: `query`
- Indexing: `performed=false`, `triggered=false`, `reason=adopted-existing-roo-index`
- Adoption counters: `processedFiles=0`, `skippedFiles=10`, `indexedBlocks=0`, `deletedFiles=0`
- Results: non-empty

Follow-up note:
- A later reconciliation fix changed this behavior to `adopted-existing-roo-index-reconciled` with active indexing. See `docs/plans/artifacts/test-evidence/live-adoption-reconciliation.md`.

### background
From `tmux-background.jsonl`:
- Tool invoked: `codebase_search`
- Input mode: `background`
- Indexing: `performed=false`, `triggered=true`, `reason=background-refresh-scheduled`
- Results: non-empty

## Validation Summary
- tmux-driven end-to-end invocation works against user settings.
- Mode semantics match plan:
  - `disabled` -> search-only
  - `query` -> indexing path invoked (adoption path in this run)
  - `background` -> non-blocking with background trigger

## Additive Rerun (post ignore/ranking parity)

Date: 2026-02-15

Server/session:
- Server URL: `http://127.0.0.1:38271`
- Settings file: `/home/<user>/Documents/pgit/Roo-Code/.opencode/codebase-search.settings.jsonc`
- Model override used for runner commands: `-m openai/gpt-5.3-codex`

Run note:
- One warm-up `--attach` run without explicit model hit `ProviderModelNotFoundError` for `openai/gpt-5.2-codex-high`.
- Subsequent matrix commands with explicit model override completed successfully.

### disabled (rerun)
- `indexing.mode=disabled`
- `indexing.reason=search-only-existing-index`
- Top result was code-first (`src/auth/password.ts`) with `README.md` retained lower in the list.

### query (rerun)
- `indexing.mode=query`
- `indexing.reason=already-fresh`
- `performed=false`, `triggered=false`, `skippedFiles=10`
- Top result remained `src/auth/password.ts`.

### background (rerun)
- `indexing.mode=background`
- `indexing.reason=background-refresh-scheduled`
- `performed=false`, `triggered=true`
- Top results were retry queue code blocks in `src/orders/retryQueue.ts`.

Rerun interpretation:
- Mode matrix semantics remained correct under tmux orchestration after the parity changes.
- Ranking parity improvements remained observable in tmux runs (code-first for code-centric queries).
