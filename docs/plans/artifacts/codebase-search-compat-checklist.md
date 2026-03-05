# Phase 0 Artifact: Codebase Search Compatibility Checklist

## Objective
Freeze the compatibility contract required to extract Roo semantic search into `.opencode/` while reusing existing Roo indexes.

## Source of Truth
- `src/services/code-index/vector-store/qdrant-client.ts`
- `src/services/code-index/processors/scanner.ts`
- `src/services/code-index/processors/parser.ts`
- `src/services/code-index/search-service.ts`
- `src/services/code-index/constants/index.ts`
- `src/core/tools/CodebaseSearchTool.ts`

## Frozen Compatibility Invariants

### Workspace -> Collection Mapping
- [x] Collection name must be `ws-${sha256(workspacePath).slice(0,16)}`.
- [x] Workspace path used for hashing must match Roo workspace root semantics.
- [x] Collection reuse is required if the same hashed workspace collection already exists.

### Point Identity and Payload Shape
- [x] Point IDs must be `uuidv5(segmentHash, QDRANT_CODE_BLOCK_NAMESPACE)`.
- [x] Namespace must remain `f47ac10b-58cc-4372-a567-0e02b2c3d479`.
- [x] Payload fields required for search output: `filePath`, `codeChunk`, `startLine`, `endLine`.
- [x] Payload should include `segmentHash` for traceability/debugging.

### Path Segment Semantics
- [x] `pathSegments` payload object must be generated from `filePath` segments keyed by numeric strings.
- [x] Search path filter must match `pathSegments.{index}` prefix conditions.
- [x] Metadata points must be excluded in query-time filters (`must_not type=metadata`).

### Metadata Marker Semantics
- [x] Deterministic metadata point id: `uuidv5("__indexing_metadata__", namespace)`.
- [x] In-progress marker: `type=metadata`, `indexing_complete=false`, `started_at`.
- [x] Complete marker: `type=metadata`, `indexing_complete=true`, `completed_at`.
- [x] Backward compatibility fallback: if marker missing and `points_count > 0`, treat as indexed.

### Incremental Indexing Behavior
- [x] Changed files must delete old vectors before upsert.
- [x] New/changed/deleted detection is hash-based and cache-backed.
- [x] Deleted files must remove vectors and clear cache entries.

### Search Behavior
- [x] Query text must be embedded once per request.
- [x] Optional directory prefix must be normalized before filtering.
- [x] Search thresholds/defaults must come from index config defaults when unset.

### Provider/Dimension Behavior
- [x] Vector dimension must derive from provider/model profile first.
- [x] Explicit model dimension fallback applies only when model profile dimension is unavailable.
- [x] Collection with incompatible dimension may be recreated by Roo logic; extracted tool must not silently diverge.

## Workspace Resolution Decision for Extraction
- [x] OpenCode tool/plugin runtime should use `context.worktree` as the primary workspace root.
- [x] The chosen workspace root must be the same path used for collection hash and relative-path payload generation.

## Index Adoption Decision (Existing Roo Collection + Missing Local Cache)
- [x] Adopt existing collection instead of creating a duplicate.
- [x] Initialize local cache from current workspace scan state.
- [x] Apply incremental reconciliation (new/changed/deleted) against adopted collection.

## Validation Status
- [x] Contract frozen from Roo source review.
- [ ] Live validation pending (Phase 7): prove invariants through OpenCode invocation and Qdrant checks.
