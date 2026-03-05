# Live Evidence: index-status on mcp-obsidian

Date: 2026-02-21

## Purpose

Validate the index-status CLI against the real workspace referenced in the plan (`/home/<user>/Documents/pgit/mcp-obsidian`) for:

- one-shot diagnostics
- watch-mode NDJSON output
- watch-mode human output and clean signal-stop summary
- watch-mode `--no-skip-diff` override behavior

## Workspace and Settings

- Worktree: `/home/<user>/Documents/pgit/mcp-obsidian`
- Settings path resolved by CLI: `/home/<user>/.config/opencode/codebase-search.settings.jsonc`
- Provider/model: `gemini / gemini-embedding-001 (3072d)`
- Qdrant: `http://<qdrant-host>:6333`

## Commands

```bash
npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian"
npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian" --compact
timeout -s INT 10 npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian" --watch --interval-ms 3000 --compact
timeout -s INT 8 npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian" --watch --interval-ms 3000 --compact --no-skip-diff
timeout -s INT 8 npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian" --watch --interval-ms 2000
```

## One-shot Result Snapshot

- qdrant collection: `ws-ff135260ca5173ef`
- qdrant points: `371`
- indexing complete: `true`
- last completed: `2026-02-21T20:27:47.210Z`
- cache entries: `46`
- indexable files: `46`
- dry-run diff: `changed=7`, `new=0`, `deleted=0`, `estimatedBlocks=139`, `estimatedBatches=3`
- assessments:
  - `disabled`: `ok`
  - `query`: `warning` (`7 files pending reconciliation`)
  - `background`: `warning` (`7 files pending; last completed 3m ago`)

## Watch-mode Results

### `--compact` (default watch `skipDiff=true`)

- Emitted multiple NDJSON lines with required top-level fields:
  - `iteration`
  - `intervalMs`
  - `elapsedMs`
  - `deltas`
  - `status`
- Confirmed watch defaults to `diff: null` and query/background explanations note unknown pending workload when diff is skipped.

### `--compact --no-skip-diff`

- Emitted multiple NDJSON lines where `status.diff` is non-null each iteration.
- Diff values remained consistent across iterations (`changed=7`, `estimatedBatches=3`) for this run.

### Human watch mode

- Screen was cleared and full table was re-rendered each iteration.
- SIGINT exit printed final summary with aggregate deltas and elapsed time.

## Interpretation

- The CLI provides actionable per-mode troubleshooting data for this workspace in one-shot mode.
- Watch mode behavior matches design in both machine-readable (NDJSON) and human-readable forms.
- During this capture there was no concurrent active indexing run, so points/cache deltas stayed `0`; this is expected.

## Concurrent query capture (non-zero watch deltas)

Date: 2026-02-21

### Commands

```bash
timeout -s INT 20 npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian" --watch --interval-ms 1000 --compact > /tmp/index-status-watch-mcp-obsidian.ndjson &
timeout 180 opencode run -m openai/gpt-5.3-codex --format json --dir "/home/<user>/Documents/pgit/mcp-obsidian" \
  "Use ONLY the codebase_search tool. Call it with query 'indexing health probe', mode 'query', and maxResults 5. Return exactly the JSON result." \
  > /tmp/index-status-query-mcp-obsidian.json
```

### Query run result (tool output)

- `mode=query`
- `indexing.reason=incremental-index-applied`
- `processedFiles=7`
- `skippedFiles=39`
- `indexedBlocks=139`
- `deletedFiles=0`

### Watch transitions observed

- Iteration 10: `qdrantPoints=-59` (`371 -> 312`), `indexingCompleteChanged=true` (`true -> false`)
- Iteration 12: `qdrantPoints=+60` (`312 -> 372`)
- Iteration 13: `qdrantPoints=+60` (`372 -> 432`)
- Iteration 14: `qdrantPoints=+19` (`432 -> 451`), `indexingCompleteChanged=true` (`false -> true`)

These transitions confirm watch-mode visibility into in-flight reconciliation progress and completion state.

### Post-query one-shot snapshot

- qdrant points: `451`
- indexing complete: `true`
- dry-run diff: `changed=0`, `new=0`, `deleted=0`, `estimatedBatches=0`
- assessments:
  - `disabled`: `ok`
  - `query`: `ok` (`No pending reconciliation work; query mode should stay fast.`)
  - `background`: `ok` (`Background appears caught up`)

## Concurrent background capture (scheduled refresh)

Date: 2026-02-21

### Commands

```bash
timeout -s INT 30 npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian" --watch --interval-ms 1000 --compact > /tmp/index-status-watch-mcp-obsidian-background.ndjson &
timeout 180 opencode run -m openai/gpt-5.3-codex --format json --dir "/home/<user>/Documents/pgit/mcp-obsidian" \
  "Use ONLY the codebase_search tool. Call it with query 'background indexing health probe', mode 'background', and maxResults 5. Return exactly the JSON result." \
  > /tmp/index-status-background-mcp-obsidian-1.json
timeout 180 opencode run -m openai/gpt-5.3-codex --format json --dir "/home/<user>/Documents/pgit/mcp-obsidian" \
  "Use ONLY the codebase_search tool. Call it with query 'background indexing health probe second pass', mode 'background', and maxResults 5. Return exactly the JSON result." \
  > /tmp/index-status-background-mcp-obsidian-2.json
timeout 180 opencode run -m openai/gpt-5.3-codex --format json --dir "/home/<user>/Documents/pgit/mcp-obsidian" \
  "Use ONLY the codebase_search tool. Call it with query 'background indexing health probe final pass', mode 'background', and maxResults 5. Return exactly the JSON result." \
  > /tmp/index-status-background-mcp-obsidian-3.json
```

### Background run results (tool output)

- Each run reported:
  - `mode=background`
  - `indexing.performed=false`
  - `indexing.triggered=true`
  - `indexing.reason=background-refresh-scheduled`

### Watch transitions observed

- Baseline at iteration 1: `points=487`, `indexingComplete=true`
- Iteration 15: `indexingCompleteChanged=true` (`true -> false`)
- Iteration 16: `qdrantPoints=+21` (`487 -> 508`) and `indexingCompleteChanged=true` (`false -> true`)

These transitions confirm background-mode scheduling produces asynchronous indexing work that watch mode can observe to completion.

### Post-background one-shot snapshot

- qdrant points: `508`
- indexing complete: `true`
- dry-run diff: `changed=0`, `new=0`, `deleted=0`, `estimatedBatches=0`
- assessments:
  - `disabled`: `ok`
  - `query`: `ok`
  - `background`: `ok`
