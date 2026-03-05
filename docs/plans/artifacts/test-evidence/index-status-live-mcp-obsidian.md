# Live Evidence: index-status on mcp-obsidian

Date: 2026-02-21

## Purpose

Validate the index-status CLI against the real workspace referenced in the plan (`/home/<user>/Documents/pgit/mcp-obsidian`) for:

- one-shot diagnostics
- watch-mode NDJSON output
- watch-mode human output and clean signal-stop summary
- watch-mode `--no-skip-diff` override behavior

## Workspace and Settings

- Worktree: `/home/alvins/Documents/pgit/mcp-obsidian`
- Settings path resolved by CLI: `/home/alvins/.config/opencode/codebase-search.settings.jsonc`
- Provider/model: `gemini / gemini-embedding-001 (3072d)`
- Qdrant: `http://192.168.10.72:6333`

## Commands

```bash
npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/alvins/Documents/pgit/mcp-obsidian"
npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/alvins/Documents/pgit/mcp-obsidian" --compact
timeout -s INT 10 npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/alvins/Documents/pgit/mcp-obsidian" --watch --interval-ms 3000 --compact
timeout -s INT 8 npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/alvins/Documents/pgit/mcp-obsidian" --watch --interval-ms 3000 --compact --no-skip-diff
timeout -s INT 8 npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/alvins/Documents/pgit/mcp-obsidian" --watch --interval-ms 2000
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
