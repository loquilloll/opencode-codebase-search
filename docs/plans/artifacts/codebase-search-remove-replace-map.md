# Phase 0 Artifact: Remove/Replace Map for OpenCode Extraction

## Objective
Identify Roo-specific dependencies that are not required for standalone `codebase_search` runtime and define the replacement design in `.opencode/`.

## Keep vs Replace Matrix

| Concern | Roo Implementation | Action | OpenCode Extraction Target |
|---|---|---|---|
| Tool entrypoint | `src/core/tools/CodebaseSearchTool.ts` | Replace | `.opencode/tools/codebase_search.ts` using `tool()` |
| Workspace root resolution | `task.cwd` fallback to `getWorkspacePath()` (`vscode`) | Replace | Use OpenCode context `worktree` directly |
| Manager orchestration | `CodeIndexManager` + `CodeIndexOrchestrator` | Replace | Lightweight index engine facade for tool/plugin runtime |
| Background watcher | `FileWatcher` (`vscode.FileSystemWatcher`) | Replace | Plugin event-driven worker (`session.created`, `file.watcher.updated`, `session.idle`) |
| Config source | `CodeIndexConfigManager` + `ContextProxy` secrets | Replace | Env/config mapping in `.opencode/tools/codebase-search/config/*` |
| Cache location | `CacheManager` using `context.globalStorageUri` | Replace | Workspace-local cache file under `.opencode` state path |
| File reads | `vscode.workspace.fs.readFile` | Replace | Node/Bun fs (`fs/promises`) |
| File listing | `listFiles` path via VSCode ripgrep discovery | Replace | Node/Bun recursive scanner + ignore filtering |
| .rooignore runtime | `RooIgnoreController` + VSCode file watcher | Replace | Lightweight `.rooignore` loader without VSCode watcher |
| i18n | `t(...)` translation keys | Replace | Plain English errors/messages |
| Telemetry | `@roo-code/telemetry` event capture | Remove | Optional structured logs only |
| State manager | `CodeIndexStateManager` event emitter | Replace | Minimal in-process status object for tool output |
| Vector store | `QdrantVectorStore` in `qdrant-client.ts` | Keep (port) | Preserve collection/id/payload/metadata semantics |
| Parser/chunking | `CodeParser` + tree-sitter/markdown parser | Keep (port) | Preserve segment-hash and chunking behavior |
| Scanner batching | `DirectoryScanner` batch/retry logic | Keep (port and trim) | Keep hashing/upsert/delete/retry core |
| Embedders | Provider embedders in `src/services/code-index/embedders/*` | Keep (port and trim) | Preserve all provider support and response decoding quirks |

## Files to Port with Minimal Behavioral Change
- `src/services/code-index/vector-store/qdrant-client.ts`
- `src/services/code-index/processors/parser.ts`
- `src/services/code-index/processors/scanner.ts` (without VSCode/telemetry/i18n dependencies)
- `src/services/tree-sitter/*` (language loader, markdown parser, query files)
- `src/services/code-index/shared/supported-extensions.ts`
- `src/shared/embeddingModels.ts` (relevant lookup parts)
- `src/services/code-index/constants/index.ts`
- `src/services/code-index/embedders/*`

## Files to Exclude from Extraction
- `src/services/code-index/manager.ts`
- `src/services/code-index/orchestrator.ts`
- `src/services/code-index/state-manager.ts`
- `src/services/code-index/processors/file-watcher.ts`
- `src/services/code-index/config-manager.ts`
- `src/core/ignore/RooIgnoreController.ts` (replace with lightweight version)
- VSCode-only utility paths under `src/utils/path.ts` that depend on `vscode`

## Replacement Design Notes

### Config and Mode Resolution
- New mode resolver:
  1. tool argument override
  2. env var `CODEBASE_SEARCH_INDEX_MODE`
  3. default `disabled`
- Provider config loaded from env vars with validation at startup/use time.

### Background Indexing
- Implement in `.opencode/plugins/codebase-index-worker.ts`.
- Use single-flight lock + debounce to avoid duplicate scans.
- In `background` mode, search returns immediately and schedules urgent refresh if stale/missing.

### Index Reuse and Adoption
- Recompute collection name from workspace hash and attach to existing Roo collection.
- If cache missing but collection exists, run adoption sync instead of creating duplicate indexes.
- Preserve metadata marker behavior for compatibility.

## Risks to Watch During Implementation
- Workspace path mismatch causes different collection hash (duplicate collection risk).
- Platform path separator mismatch can break `pathSegments` filtering.
- Tree-sitter WASM path resolution differences outside Roo extension bundle.
- Provider-specific embedding response formats (especially base64 decoding paths).
