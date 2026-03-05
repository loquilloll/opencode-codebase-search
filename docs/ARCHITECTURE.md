# Architecture

## Runtime components

- `src/tools/codebase_search.ts`
  - OpenCode tool contract and argument validation
  - delegates execution to engine

- `src/tools/codebase-search/engine.ts`
  - top-level mode orchestration (`disabled`, `query`, `background`)
  - provider/config initialization
  - result formatting and reranking application

- `src/tools/codebase-search/indexer.ts`
  - incremental/full indexing flow
  - cache reconciliation and adoption logic
  - file scanning + parsing + embedding + upsert

- `src/tools/codebase-search/parser.ts`
  - tree-sitter and fallback chunking

- `src/tools/codebase-search/qdrant.ts`
  - collection management and vector operations
  - dimension mismatch recreate behavior

- `src/plugins/codebase-index-worker.ts`
  - background trigger wiring from OpenCode events

## Source vs runtime layout

- Canonical editable source: `src/`
- Generated runtime payload: `.opencode/` (created by `npm run sync:opencode`)

Generated runtime folder is intentionally not the source of truth.

## Distribution boundaries

Release assets include only runtime-required payload and top-level docs/templates.

Development-only artifacts remain in-repo but out-of-asset:

- `docs/plans/`
- fixture projects
- test evidence logs
