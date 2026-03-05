# Multi-Phase Build Plan: Roo Codebase Search -> OpenCode Custom Tool

## Goal
Extract Roo's semantic codebase search into a self-contained OpenCode implementation under `.opencode/` that reuses existing Roo indexes and supports three indexing modes:

- `disabled` (default)
- `query`
- `background`

Assumption: Roo-Code stays running, so OpenCode plugin hooks can drive background indexing.

## Non-Negotiable Requirements
- Remove extension-only parts that are not needed for `codebase_search` runtime.
- Reuse existing Roo indexes in Qdrant; do not create duplicate collections for the same workspace.
- Support all Roo embedder providers:
  - `openai`
  - `ollama`
  - `openai-compatible`
  - `gemini`
  - `mistral`
  - `vercel-ai-gateway`
  - `bedrock`
  - `openrouter`
- Implement all three indexing modes:
  - `disabled` is default
  - `query` performs per-query incremental indexing
  - `background` uses plugin-driven indexing and returns immediately on query

## Indexing Modes (authoritative behavior)

### `disabled` (default)
- Search only existing index data.
- No indexing work triggered from tool or plugin.

### `query`
- `codebase_search` runs `ensureIndexFresh()` synchronously before vector query.
- Guarantees highest freshness at query time, with higher latency.

### `background`
- Plugin hooks drive incremental indexing in the background.
- `codebase_search` never blocks on indexing.
- If index is missing or stale, query returns immediately with best-available results and a status note, and schedules urgent indexing.

## Target Deliverables
- `.opencode/tools/codebase_search.ts` (OpenCode tool entrypoint)
- `.opencode/plugins/codebase-index-worker.ts` (plugin-driven background indexer)
- `.opencode/tools/codebase-search/**` (portable semantic search/index implementation)
- `.opencode/package.json` (tool/plugin dependencies)
- `.opencode/tools/codebase-search/README.md` (setup, env vars, mode behavior, troubleshooting)
- Tests for compatibility, modes, indexing, and search behavior

## Compatibility Contract (must match Roo)
- Collection name: `ws-${sha256(workspacePath).slice(0,16)}`
- Point ID: `uuidv5(segmentHash, QDRANT_CODE_BLOCK_NAMESPACE)`
- Payload keys: `filePath`, `codeChunk`, `startLine`, `endLine`, `segmentHash`, `pathSegments.*`
- Metadata marker semantics:
  - `__indexing_metadata__` point with `type: "metadata"`
  - `indexing_complete: true|false`
  - `started_at` and `completed_at` timestamps when present
- Path filtering behavior via `pathSegments` prefix matches

## Feature Parity Gap Closure (explicit)
- Tree-sitter-based chunking parity (Phase 4 hard requirement)
- Dimension-mismatch recreate behavior parity with Roo Qdrant flow (Phase 2/4 hardening)
- Scanner/ignore parity with OpenCode conventions using `.ignore` (Phase 4)
- Output/ranking behavior parity tuning for code-first relevance and stable formatting (Phase 6/7)

## Testing Methodology (Build-Time + Live OpenCode)

### Principles
- Test continuously as each phase lands; do not defer verification to the end.
- Keep compatibility assertions running from early phases to prevent drift from Roo behavior.
- Validate both internal engine behavior and real tool invocation through OpenCode CLI.

### Test Layers
- Unit tests: hashing, point id generation, payload mapping, mode resolution, ignore/path filtering.
- Integration tests: incremental indexer + Qdrant + cache adoption + metadata transitions.
- Live OpenCode tests: launch OpenCode and trigger `codebase_search` from `opencode run`.

### Required Live Tool Invocation Checks
- Start a local OpenCode server for repeatable non-interactive tests.
- Trigger prompts that explicitly require `codebase_search` and inspect JSON event output.
- Run a mode matrix (`disabled`, `query`, `background`) and assert behavior:
  - `disabled`: no indexing writes, search uses existing vectors only.
  - `query`: indexing runs before search results are returned.
  - `background`: query returns immediately, urgent background indexing is scheduled.

### Suggested Execution Pattern
```bash
# terminal 1
CODEBASE_SEARCH_INDEX_MODE=background opencode serve --port 4096

# terminal 2
opencode run --attach http://localhost:4096 --format json \
  "Use ONLY the codebase_search tool. Query: 'CodeIndexManager initialize'. Return top 3 hits."
```

### tmux-cli Orchestration (preferred for live tests)
- Use `tmux-cli` to drive repeatable multi-pane test runs (server pane + runner pane + verification pane).
- In this workspace, `tmux-cli` is available and should be used as the default live-test driver.
- Keep a preflight check in the test harness: verify `tmux-cli` availability before executing the tmux path.
- If `tmux-cli` is missing in another environment, install `claude-code-tools` and then rerun tmux-driven flows.
- Run the full mode matrix (`disabled`, `query`, `background`) through tmux-managed commands and store pane outputs as test evidence.
- Keep a non-tmux fallback (`opencode serve` + `opencode run`) for environments where tmux orchestration is unavailable.

### tmux-cli Default Run Flow
```bash
# Launch shell panes
tmux-cli launch "zsh"                  # server pane
tmux-cli launch "zsh"                  # runner pane

# Start OpenCode server in server pane
tmux-cli send "CODEBASE_SEARCH_INDEX_MODE=background opencode serve --port 4096" --pane=<SERVER_PANE>

# Run non-interactive tool-trigger prompt in runner pane
tmux-cli execute "opencode run --attach http://localhost:4096 --format json 'Use ONLY the codebase_search tool. Query: CodeIndexManager initialize. Return top 3 hits.'" --pane=<RUNNER_PANE> --timeout=120

# Capture outputs for evidence
tmux-cli capture --pane=<SERVER_PANE>
tmux-cli capture --pane=<RUNNER_PANE>
```

### Evidence Capture
- Save per-mode command output summaries to `docs/plans/artifacts/test-evidence/`.
- Record latency and indexing-status observations for each live run.
- Record Qdrant collection/write checks proving no duplicate workspace collection was created.

---

## Phase 0 - Kickoff and Compatibility Freeze
Subagent type: `explore`

### Scope
- Produce a precise compatibility checklist from Roo implementation.
- Identify extension-only dependencies to remove or replace.

### Tasks
- Validate collection naming and payload/metadata schema from Roo code.
- Confirm workspace root resolution order (`context.worktree` first).
- Confirm index-adoption behavior when collection exists but local cache is missing.
- Confirm metadata semantics for stale/in-progress detection in background mode.

### Outputs
- `docs/plans/artifacts/codebase-search-compat-checklist.md`
- `docs/plans/artifacts/codebase-search-remove-replace-map.md`

### Exit Criteria
- Checklist is complete and approved before coding phases begin.

---

## Phase 1 - Tool and Plugin Scaffold
Subagent type: `general`

### Scope
- Create OpenCode runtime scaffold for tool + plugin.

### Tasks
- Add `.opencode/package.json` with required dependencies.
- Add `.opencode/tools/codebase_search.ts` using `tool()` helper.
- Add `.opencode/plugins/codebase-index-worker.ts` plugin shell.
- Add internal module layout in `.opencode/tools/codebase-search/`.
- Define typed config and mode selection from env vars.

### Outputs
- Tool and plugin load without runtime import errors.

### Exit Criteria
- OpenCode startup loads local tool and plugin successfully.

---

## Phase 2 - Core Portable Engine
Subagent type: `general`

### Scope
- Port non-UI, non-extension code required for indexing and search.

### Tasks
- Port and adapt:
  - constants and types
  - embedding model profile lookup
  - Qdrant vector store client
  - cache manager (filesystem JSON cache, not VSCode storage)
  - path normalization helpers
- Remove i18n and telemetry dependencies; replace with direct, actionable error messages.
- Keep Roo-compatible hashing, ids, metadata marker behavior, and path filtering.

### Outputs
- Reusable core APIs: `vectorStore`, `config`, `cache`, `searchService`.

### Exit Criteria
- Core APIs can initialize and query an existing Roo collection.

---

## Phase 3 - All Provider Embedders
Subagent type: `general`

### Scope
- Implement provider parity with Roo.

### Tasks
- Implement or port embedders for all providers.
- Keep shared OpenAI-compatible base for:
  - `openai-compatible`, `gemini`, `mistral`, `vercel-ai-gateway`
- Keep dedicated implementations for:
  - `openai`, `ollama`, `openrouter`, `bedrock`
- Preserve base64 embedding decode logic where Roo relies on it.

### Outputs
- Provider factory and `validateConfiguration()` checks.

### Exit Criteria
- Each provider passes a minimal validation smoke check.

---

## Phase 4 - Parser and Incremental Indexer Core (No Watcher)
Subagent type: `general`

### Scope
- Build indexing pipeline that can run on-demand from tool or plugin.

### Tasks
- Port parser/scanner/chunking logic and tree-sitter query files.
- Achieve tree-sitter chunking parity for supported languages with fallback chunking only for Roo fallback extensions.
- Use OpenCode `.ignore` as first-class ignore source (plus existing ignore rules).
- Replace VSCode file APIs with Node/Bun filesystem operations.
- Replace RooIgnoreController with lightweight `.rooignore` support.
- Respect `.gitignore` and existing ignored directory rules.
- Implement `ensureIndexFresh()`:
  - load cache
  - detect new/changed/deleted files
  - batch embed and upsert
  - delete stale vectors
  - mark indexing complete/incomplete
- Implement adoption mode:
  - if Roo collection exists and cache missing, initialize cache without creating duplicate collections.

### Outputs
- Stable incremental indexer API with lock/guard support for concurrent calls.

### Exit Criteria
- Re-running indexing after no file changes performs near-zero writes.
- Tree-sitter chunking is active and validated on representative TS/TSX/Python files.
- `.ignore` is honored by scanner path discovery.

---

## Phase 4A - Active Implementation Slice (current)
Subagent type: `general`

### Scope
- Execute parity-first implementation pass starting with tree-sitter chunking.

### Tasks
- Implement tree-sitter parser/chunking parity in `.opencode/tools/codebase-search/parser.ts` and supporting tree-sitter modules.
- Verify query-mode indexing produces code-first hits in fixture workspace after cache reset.

### Exit Criteria
- Query-mode run returns expected source file hits (not README-only dominance) for code-centric queries.

---

## Phase 5 - Plugin-Driven Background Index Worker
Subagent type: `general`

### Scope
- Implement background mode behavior via OpenCode plugin events.

### Tasks
- Wire plugin event handlers:
  - `session.created`
  - `file.watcher.updated`
  - `session.idle`
- Add debouncing/throttling and single-flight lock to avoid duplicate indexing runs.
- Use metadata and cache timestamps to skip redundant work.
- Add urgent queue path for stale/missing index signals from `codebase_search`.

### Outputs
- Background worker that keeps index fresh while Roo/OpenCode are running.

### Exit Criteria
- Query path is non-blocking in `background` mode and background jobs process updates.

---

## Phase 6 - Search Tool Integration by Mode
Subagent type: `general`

### Scope
- Finalize `codebase_search` behavior for all modes.

### Tasks
- Mode resolution precedence:
  1. tool argument override (optional)
  2. env var (`CODEBASE_SEARCH_INDEX_MODE`)
  3. default `disabled`
- In `codebase_search.execute()`:
  1. resolve workspace root (`context.worktree`)
  2. initialize config/provider/vector store
  3. apply mode behavior:
     - `disabled`: search only
     - `query`: `ensureIndexFresh()` then search
     - `background`: queue urgent background refresh (if stale/missing), return immediately with best-available results + status
  4. format Roo-like search results
- Preserve optional directory path filtering.

### Outputs
- End-to-end search tool with explicit mode semantics.

### Exit Criteria
- All mode behaviors match this plan.

---

## Phase 7 - Tests and Verification (Mode Matrix)
Subagent type: `test-writer`

### Scope
- Add tests for compatibility and all mode behaviors.

### Tasks
- Compatibility tests:
  - collection naming parity
  - point ID parity
  - payload/metadata shape parity
- Indexing tests:
  - new file indexed
  - changed file reindexed
  - deleted file removed from vector store
  - no-op run does not rewrite index unnecessarily
- Mode tests:
  - `disabled` does not index
  - `query` indexes before search
  - `background` does not block search and schedules urgent indexing
- Search tests:
  - path filter behavior
  - metadata points excluded
  - result formatting
- Live OpenCode invocation tests:
  - run `opencode serve` + `opencode run --format json` and verify `codebase_search` tool events
  - verify mode matrix behavior from real CLI execution
  - verify no duplicate Roo collection is created during live runs
  - run equivalent matrix through `tmux-cli` orchestration (default path) and verify pane outputs are captured

### Outputs
- Automated tests and a short smoke-test command list in README.
- Live test evidence notes under `docs/plans/artifacts/test-evidence/`.
- tmux-driven runbook/checklist under `docs/plans/artifacts/test-evidence/tmux-cli-runbook.md`.

### Exit Criteria
- Tests pass locally for core flows and mode matrix.
- Live OpenCode invocation checks pass for all three modes.
- tmux-cli orchestration path is documented and produces reproducible live test evidence.

---

## Phase 8 - Docs, Hardening, and Handoff
Subagent type: `general`

### Scope
- Final documentation and operational guidance.

### Tasks
- Document env vars for all providers.
- Document mode configuration, defaults, and query-time behavior.
- Document index reuse behavior and adoption mode.
- Document limitations and fallback behaviors.
- Add troubleshooting for Qdrant connectivity, provider auth, and background worker state.

### Outputs
- `.opencode/tools/codebase-search/README.md` complete and actionable.

### Exit Criteria
- Another engineer can set up and run the tool without reading Roo internals.

---

## Active Execution Queue (2026-02-15)

Work these items in strict order, completing each before starting the next:

1. [DONE] Add focused automated tests for:
   - ranking rerank behavior (code-first for code queries, docs-first for docs queries)
   - `.ignore` directory slash semantics (`path` + `path/` matching)
2. [DONE] Re-run full tmux mode matrix (`disabled`, `query`, `background`) with user settings and append this parity pass to existing evidence docs.
3. [DONE] Prepare a clean commit proposal with:
   - concise commit message (why-focused)
   - exact file list for this parity + validation increment.

Exit criteria for this queue:
- New automated tests pass locally.
- tmux evidence docs include a dated additive section for the new run.
- Commit proposal is ready for user approval.

---

## Parallel Execution Strategy
- Sequential dependencies:
  - Phase 0 -> Phase 1 -> Phase 2
  - Phase 2 -> Phase 6
  - Phase 6 -> Phase 8
- Parallelizable work:
  - Phase 3 can start after Phase 2 interfaces are stable.
  - Phase 4 can proceed in parallel with late Phase 3 using embedder mocks.
  - Phase 5 can start once Phase 4 core indexer API exists.
  - Phase 7 can start once Phase 6 interfaces are stable.

## Suggested Subagent Dispatch Sequence
1. Launch `explore` for Phase 0 artifacts.
2. Launch `general` for Phase 1 and Phase 2.
3. Launch two `general` subagents in parallel:
   - one for Phase 3 (providers)
   - one for Phase 4 (indexer/parser)
4. Launch `general` for Phase 5 (plugin background worker).
5. Launch `general` for Phase 6 (mode-aware tool integration).
6. Launch `test-writer` for Phase 7.
7. Launch `general` for Phase 8 docs/handoff.

## Definition of Done
- `codebase_search` works as an OpenCode custom tool from `.opencode/tools/`.
- Existing Roo Qdrant index is reused (no duplicate workspace collection).
- Mode behavior is correct:
  - `disabled` default
  - `query` pre-query incremental indexing
  - `background` non-blocking query with plugin-driven indexing
- All Roo providers are supported and configurable.
- Tests and docs are complete, including live OpenCode tool-invocation validation.
