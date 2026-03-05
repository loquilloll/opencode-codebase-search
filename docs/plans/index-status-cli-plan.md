# Index Status CLI Plan

## Objective

Create a CLI diagnostic tool (`scripts/codebase-index-status.ts`) that can troubleshoot **every indexing mode** for any worktree. The tool surfaces:

- **disabled mode**: Can a search execute? Does the collection exist with indexed data?
- **query mode**: Why is it slow? How large is the reconciliation workload? How many files changed, how many blocks need embedding, how many batches will the API need?
- **background mode**: Did a recent run succeed? What would the next run process? When did indexing last complete?

It does this by performing a **read-only dry-run diff** — the same file scan + hash + cache comparison that `ensureIndexFresh()` does, but without calling the embedding API or writing to Qdrant.

A `--watch` mode is a core feature for monitoring live indexing progress (watching points/cache grow while a `query` or `background` run is active in another process).

## Motivation

When `codebase_search` is slow in a workspace (e.g., mcp-obsidian), there is no way to understand the cost before paying it. The root cause is typically `query` mode triggering a full reconciliation because the cache is stale (e.g., 36 entries vs 390 indexable files). Every changed file requires content hashing, tree-sitter parsing, and embedding API calls — all synchronous in `query` mode.

This CLI previews that reconciliation cost without incurring it, and can monitor an active indexing run in real time.

## Per-Mode Diagnostic Value

### disabled mode
**Question**: "Will `codebase_search` return results?"
**Answer from CLI**: Collection exists, has N points, indexing metadata says complete/incomplete. If no collection or zero points → search will return empty.

### query mode
**Question**: "Why does `codebase_search` take 30+ seconds?"
**Answer from CLI**: Dry-run diff shows 354 changed files producing ~1,200 blocks in ~20 embedding batches. Cache has 36 entries vs 390 indexable files. Assessment: full reconciliation required, estimated heavy.

### background mode
**Question**: "Is background indexing keeping up? Did it fail?"
**Answer from CLI**: Qdrant metadata shows last `completed_at` timestamp. Dry-run diff shows pending workload. If `completed_at` is recent and diff is zero → background is keeping up. If diff is large → background hasn't caught up yet (or isn't running). Note: in-process queue state (`running`/`pending`) from `background-index-queue.ts` is not accessible from CLI (different process), so the CLI infers background health from Qdrant timestamps and the diff.

## User-Approved Scope

- CLI script at `scripts/codebase-index-status.ts`, runnable via `npx --yes tsx scripts/codebase-index-status.ts`
- `--watch` is a core requirement (not deferred to a follow-up)
- Must work for any worktree path, not just the current repository

## Guardrails

- **Read-only**: never trigger indexing, never write to Qdrant or cache.
- Reuse existing modules (`config.ts`, `qdrant.ts`, `cache.ts`, `scanner.ts`, `parser.ts`) without modifying their public APIs (one exception: `QdrantIndexStore.getCollectionInfo()` is promoted from private to public to avoid duplicating the Qdrant client setup).
- Each phase is independently committable and does not break existing tests or release gates.
- Qdrant probes must use a timeout (10s default) so the CLI never hangs.
- File hashing during dry-run respects `MAX_FILE_SIZE_BYTES` skip threshold (same as indexer).

## Non-Goals (for this slice)

- No changes to indexing modes, ranking, or ignore behavior.
- No new OpenCode custom tool (CLI only).
- No embedding API calls (dry-run does not generate vectors).
- No modifications to `ensureIndexFresh()` hot path.

## Commit-Safe Phase Plan

### Phase 1 — Status Collector Core + Types

**Goal**
Create a data-gathering module that assembles full index status including a dry-run reconciliation diff.

**Changes**

#### `src/tools/codebase-search/types.ts` — new status types

```typescript
export interface StatusOptions {
  timeoutMs?: number
  /** Skip the dry-run diff (file hashing). Faster but no reconciliation preview. */
  skipDiff?: boolean
}

export interface QdrantStatus {
  reachable: boolean
  url: string
  collectionName: string
  collectionExists: boolean
  pointsCount: number
  indexingComplete: boolean | null
  lastCompletedAt: number | null
  error?: string
}

export interface CacheStatus {
  filePath: string
  exists: boolean
  entryCount: number
  legacyFilePath: string
  legacyExists: boolean
}

export interface WorktreeStatus {
  worktree: string
  indexableFileCount: number
  scanDurationMs: number
}

export interface DiffStatus {
  /** Files whose content hash differs from cached hash (need re-embedding). */
  changedFiles: number
  /** Files on disk with no cache entry (new, need embedding). */
  newFiles: number
  /** Cache entries with no file on disk (will be deleted from Qdrant). */
  deletedFiles: number
  /** Files skipped due to size limit or read errors. */
  skippedFiles: number
  /** Estimated number of parsed blocks from changed+new files. */
  estimatedBlocks: number
  /** Estimated embedding API batches (blocks / BATCH_SEGMENT_THRESHOLD). */
  estimatedBatches: number
  /** Time taken for the dry-run diff. */
  diffDurationMs: number
}

export interface ModeAssessment {
  mode: string
  /** Human-readable explanation of what this mode will do given current state. */
  explanation: string
  /** Severity: ok | warning | problem */
  severity: "ok" | "warning" | "problem"
}

export interface ConfigStatus {
  settingsFilePath: string
  provider: string
  modelId: string
  modelDimension: number | undefined
  indexMode: string
  qdrantUrl: string
  followSymlinks: boolean
  followExternalSymlinks: boolean
}

export interface IndexStatus {
  timestamp: string
  config: ConfigStatus
  qdrant: QdrantStatus
  cache: CacheStatus
  worktree: WorktreeStatus
  diff: DiffStatus | null
  assessments: ModeAssessment[]
}
```

#### `src/tools/codebase-search/qdrant.ts` — promote `getCollectionInfo()`

Change `private async getCollectionInfo()` to `async getCollectionInfo()` (public). This is the minimal API change needed — the method already exists and is used internally. Making it public avoids duplicating the Qdrant client construction and URL parsing logic in `status.ts`.

#### `src/tools/codebase-search/status.ts` — collector module

```
collectIndexStatus(worktree: string, options?: StatusOptions): Promise<IndexStatus>
```

Implementation strategy:
1. **Config**: `loadIndexConfig(worktree)` → extract settings path, provider, model, dimension, mode, qdrant URL, symlink flags.
2. **Qdrant probe** (with timeout): Create `QdrantIndexStore`, call `getCollectionInfo()` for `points_count`, `hasIndexedData()` for indexed-data check, `getMetadata()` for `indexing_complete` / `completed_at`. Wrap all calls in `Promise.race` with timeout.
3. **Cache**: Load `IndexCache` (read-only), count entries, check legacy file existence.
4. **Worktree scan**: `scanSupportedFiles()` → count indexable files, measure scan duration.
5. **Dry-run diff** (unless `skipDiff: true`): For each scanned file, read content + hash (reusing `createFileHash` from `parser.ts`), compare against cache hash. Classify as changed/new/deleted/skipped. Estimate blocks by running `parseTextIntoBlocks()` on changed+new files. Count batches as `ceil(estimatedBlocks / BATCH_SEGMENT_THRESHOLD)`.
6. **Mode assessments**: Generate per-mode explanations:
   - **disabled**: "ok" if collection has indexed data, "problem" if no collection or no data.
   - **query**: "ok" if diff is zero, "warning" if diff is small (<50 files), "problem" if diff is large (≥50 files) with explanation of expected reconciliation cost.
   - **background**: "ok" if `completed_at` is recent (<5 min) and diff is zero, "warning" if diff exists, "problem" if no `completed_at` or very old.

#### `src/tools/codebase-search/__tests__/status.test.ts`

- Test that `collectIndexStatus()` returns a well-shaped `IndexStatus` for the current worktree.
- Test that `skipDiff: true` produces `diff: null`.
- Test that unreachable Qdrant (invalid URL) returns `reachable: false` with error string.
- Test that `assessments` array contains entries for all three modes.
- Test that `worktree.indexableFileCount` is > 0 for this repository.

**Commit safety**
- New files: `status.ts`, `status.test.ts`.
- Modified files: `types.ts` (additive types only), `qdrant.ts` (visibility change only, no logic change).
- Existing tests unaffected.

**Validation gate**
- `npm run test:focused`

---

### Phase 2 — CLI One-Shot Mode

**Goal**
Create the CLI entrypoint with human-readable and JSON output for one-shot diagnostics.

**Changes**

#### `scripts/codebase-index-status.ts`

Arg parsing (using `process.argv` directly, no external dependency):
- `--worktree <path>` — target worktree (default: `process.cwd()`)
- `--timeout-ms <ms>` — Qdrant probe timeout (default: `10000`)
- `--skip-diff` — skip the dry-run diff for faster output
- `--compact` — single-line JSON (for piping)
- `--json` — pretty-printed JSON
- `--help` — usage text

Logic:
1. Validate worktree exists.
2. Call `collectIndexStatus(worktree, { timeoutMs, skipDiff })`.
3. Format and print.
4. Exit 0 on success, 1 on fatal error.
5. Handle `SIGINT` cleanly.

**Human-readable output format**
```
Index Status  2026-02-21T14:30:00Z
─────────────────────────────────────

Config
  settings     ~/.config/opencode/codebase-search.settings.jsonc
  provider     gemini / gemini-embedding-001 (3072d)
  mode         disabled
  qdrant       http://192.168.10.72:6333
  symlinks     follow=true external=false

Qdrant
  collection   ws-ff135260ca5173ef
  status       reachable
  points       18,991
  indexing     complete (2026-02-20T10:15:00Z)

Cache
  path         ~/.local/share/opencode-codebase-search/ws-ff135260ca5173ef.cache.json
  entries      36
  legacy       not present

Worktree
  path         /home/<user>/Documents/pgit/mcp-obsidian
  indexable    390 files (scanned in 120ms)

Reconciliation Preview
  changed      12 files
  new          342 files
  deleted      0 files
  skipped      3 files (size limit)
  est. blocks  ~1,180
  est. batches ~20 (of 60 segments each)
  diff time    850ms

Mode Assessments
  disabled     ✓ ok — collection has 18,991 indexed points
  query        ✗ problem — 354 files need processing (~20 embedding batches)
  background   ⚠ warning — last completed 2h ago, 354 files pending
```

#### `package.json`

Add script: `"index:status": "tsx scripts/codebase-index-status.ts"`

**Commit safety**
- New file: `scripts/codebase-index-status.ts`.
- Modified: `package.json` (additive script only).
- No source module changes.

**Validation gate**
- `npm run test:focused`
- Manual: `npx --yes tsx scripts/codebase-index-status.ts --worktree .` produces valid output

---

### Phase 3 — Watch Mode

**Goal**
Add `--watch` and `--interval-ms` flags for continuous status monitoring during active indexing.

**Use case**: Start a `codebase_search` with `query` mode in one terminal, run `index:status --watch` in another to see points/cache grow in real time.

**Changes**

Extend `scripts/codebase-index-status.ts`:

- `--watch` — enable polling loop
- `--interval-ms <ms>` — polling interval (default: `5000`)

**Behavior**:
1. On each iteration, call `collectIndexStatus()` (with `skipDiff` in watch mode by default to keep iterations fast; override with explicit `--no-skip-diff`).
2. Clear terminal (ANSI `\x1b[2J\x1b[H`) and reprint the full status table.
3. Append a delta section comparing current vs previous iteration:
   ```
   [watch] iteration 5 / interval 5s / elapsed 25s
   [watch] qdrant points: 18,991 → 19,050 (+59)
   [watch] cache entries: 36 → 120 (+84)
   [watch] indexing: incomplete → complete
   ```
4. If `--compact` or `--json` combined with `--watch`: output one JSON object per line (NDJSON) without clearing screen. Each line includes an `iteration` field and a `deltas` object.
5. `SIGINT`/`SIGTERM` stops the loop, prints a final summary with total elapsed time and aggregate deltas from first to last iteration.

**Commit safety**
- Changes limited to the CLI script.
- No source module changes.

**Validation gate**
- `npm run test:focused`
- Manual: `npx --yes tsx scripts/codebase-index-status.ts --worktree . --watch --interval-ms 3000` runs, updates, and stops cleanly on Ctrl+C

---

### Phase 4 — Docs + Release Gates

**Goal**
Wire documentation, verify npm script, confirm release gates.

**Changes**
- Update `README.md`:
  - Add `Index status` section documenting the CLI, all flags, and example output
  - Explain per-mode diagnostic value
- Update `src/tools/codebase-search/README.md`:
  - Add developer note about `status.ts` module, its read-only contract, and the dry-run diff approach
- Update `AGENTS.md`:
  - Add `npm run index:status` to build/test commands section
  - Add `scripts/codebase-index-status.ts` and `src/tools/codebase-search/status.ts` to repository map
- Update `docs/CONTINUITY.md` with plan/progress/outcome entries

**Commit safety**
- Documentation only + continuity log.

**Validation gate**
- `npm run sync:opencode`
- `npm run test:focused`
- `npm run verify:release`

---

### Phase 5 — Hardening + Regression Guards (post-plan extension)

**Goal**
Prevent regression of settings precedence and keep global OpenCode settings stable across repeated runtime sync/build cycles.

**Changes**

- Update `scripts/sync-opencode.mjs` to stop generating `.opencode/codebase-search.settings.jsonc`, so `sync:opencode` does not recreate a worktree-local override file.
- Update `scripts/verify-release.mjs` to fail if `.opencode/codebase-search.settings.jsonc` exists.
- Add focused regression tests in `src/tools/codebase-search/__tests__/config.test.ts` for settings path precedence:
  - `CODEBASE_SEARCH_SETTINGS_FILE` override wins
  - worktree `.opencode/codebase-search.settings.jsonc` wins when present
  - global `~/.config/opencode/codebase-search.settings.jsonc` is used when worktree-local file is absent

**Commit safety**
- Modified: `scripts/sync-opencode.mjs`, `scripts/verify-release.mjs`.
- New file: `src/tools/codebase-search/__tests__/config.test.ts`.
- No indexing/search logic behavior changes.

**Validation gate**
- `npm run sync:opencode`
- `npm run test:focused`
- `npm run verify:release`

## Testing Methodology

### 1) Automated tests (fast feedback)

- Add focused tests in `src/tools/codebase-search/__tests__/status.test.ts` covering:
  - Qdrant reachable/unreachable behavior
  - timeout behavior (returns structured error, does not hang)
  - `skipDiff` behavior (`diff: null`)
  - per-mode assessments are always present (`disabled`, `query`, `background`)
  - dry-run diff shape and non-negative counters
- Gate: `npm run test:focused`

### 2) CLI smoke tests (one-shot)

- `npx --yes tsx scripts/codebase-index-status.ts --worktree .`
- `npx --yes tsx scripts/codebase-index-status.ts --worktree . --json`
- `npx --yes tsx scripts/codebase-index-status.ts --worktree . --compact`
- `npx --yes tsx scripts/codebase-index-status.ts --worktree . --skip-diff`
- Acceptance:
  - non-JSON output renders all sections
  - JSON/compact output is valid and contains `assessments` + mode entries

### 3) Live mode troubleshooting matrix (real workload)

Run against the problematic workspace (for example `/home/<user>/Documents/pgit/mcp-obsidian`).

- **disabled mode diagnostic**
  - command: `npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian"`
  - verify disabled assessment explains whether existing index is searchable

- **query mode root-cause diagnostic (full index too slow)**
  - command: `npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian"`
  - verify query assessment surfaces large reconciliation workload (`changed/new/deleted`, `estimatedBlocks`, `estimatedBatches`)
  - confirm this aligns with observed slow query behavior

- **background mode health diagnostic**
  - command: `npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian"`
  - verify background assessment uses `completed_at` recency + pending diff to determine keep-up vs lag

### 4) Watch-mode live verification

- In terminal A: run status watch
  - `npx --yes tsx scripts/codebase-index-status.ts --worktree "/home/<user>/Documents/pgit/mcp-obsidian" --watch --interval-ms 3000`
- In terminal B: trigger indexing (`codebase_search` in `query` or `background` mode)
- Acceptance:
  - watch loop keeps updating without hanging
  - points/cache deltas change while indexing progresses
  - Ctrl+C exits cleanly with final summary

### 5) Final release gates

- `npm run sync:opencode`
- `npm run test:focused`
- `npm run verify:release`

### 6) Definition of test success

- All three modes have explicit, user-facing diagnostics.
- The original issue (full index taking too long) is explainable from a single status run via reconciliation workload metrics.
- Watch mode can monitor progress during a live index run and is stable under repeated polling.

### 7) Captured live evidence (2026-02-21)

- Workspace run: `/home/<user>/Documents/pgit/mcp-obsidian`
- Evidence file: `docs/plans/artifacts/test-evidence/index-status-live-mcp-obsidian.md`
- Captured one-shot diagnostics plus watch-mode verification for:
  - NDJSON iteration output (`--watch --compact`)
  - diff override behavior (`--watch --compact --no-skip-diff`)
  - clean SIGINT summary in human watch mode

## File Inventory

### New files
| File | Phase |
|------|-------|
| `src/tools/codebase-search/status.ts` | 1 |
| `src/tools/codebase-search/__tests__/status.test.ts` | 1 |
| `scripts/codebase-index-status.ts` | 2 |
| `src/tools/codebase-search/__tests__/config.test.ts` | 5 |

### Modified files
| File | Phase |
|------|-------|
| `src/tools/codebase-search/types.ts` | 1 |
| `src/tools/codebase-search/qdrant.ts` | 1 |
| `package.json` | 2 |
| `README.md` | 4 |
| `src/tools/codebase-search/README.md` | 4 |
| `AGENTS.md` | 4 |
| `docs/CONTINUITY.md` | 4 |
| `scripts/sync-opencode.mjs` | 5 |
| `scripts/verify-release.mjs` | 5 |

## Risks

- **Qdrant unreachable**: Handled by timeout wrapper; status reports `reachable: false` with error detail. All three mode assessments degrade gracefully.
- **Large worktrees + dry-run diff**: Hashing 390 files takes ~1s on SSD. For very large repos (10k+ files), `--skip-diff` flag skips hashing. Watch mode defaults to `skipDiff: true` to keep iterations fast.
- **Dry-run block estimation**: Running `parseTextIntoBlocks()` on changed files adds tree-sitter parsing overhead. For status-only use this is acceptable since it's a one-shot cost. Watch mode skips this by default.
- **`getCollectionInfo()` visibility change**: Minimal risk — method already exists, no logic change, just `private` → public. Existing callers are internal to the class and unaffected.
- **Background queue state**: The in-process `background-index-queue.ts` state (`running`/`pending`) is not accessible from CLI (different process). The CLI compensates by inferring background health from Qdrant `completed_at` timestamps and the dry-run diff size. This is explicitly documented as a known limitation.
- **Settings precedence regression**: If `.opencode/codebase-search.settings.jsonc` is regenerated, worktree-local settings can unintentionally override global config. Mitigations: `sync-opencode` no longer generates runtime settings, `verify-release` fails if runtime settings file appears, and focused config precedence tests lock resolution behavior.
