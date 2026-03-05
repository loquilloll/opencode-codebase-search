# Symlink-Following Indexer Plan

## Objective

Enable `codebase_search` indexing to follow symlinked files and symlinked directories, including symlinks that resolve outside the current worktree.

## User-Approved Scope

- Follow symlink targets inside and outside the worktree.
- Preserve existing search/index behavior for non-symlink paths.
- Keep indexed payload paths logical to the worktree view (stable, user-facing paths).

## Guardrails

- Prevent recursion loops from cyclic links (`a -> b -> a`) using real-path tracking.
- Continue honoring file extension and size constraints before indexing content.
- Apply ignore rules to logical paths (`.gitignore`, `.rooignore`, `.ignore`) to preserve current semantics.
- Skip broken/unreadable links without failing the full indexing pass.

## Non-Goals (for this feature slice)

- No deduplication of identical real files reachable from multiple symlink aliases.
- No changes to scoring/reranking behavior.
- No changes to Qdrant schema shape beyond existing `filePath` and `pathSegments` semantics.

## Commit-Safe Phase Plan

### Phase 1 - Config Contract

**Goal**
Define explicit symlink behavior in config and settings.

**Changes**
- Update `src/tools/codebase-search/types.ts`:
  - add `followSymlinks: boolean`
  - add `followExternalSymlinks: boolean`
- Update `src/tools/codebase-search/config.ts`:
  - parse booleans from env/settings
  - wire defaults into `loadIndexConfig()`
  - planned env vars:
    - `CODEBASE_SEARCH_FOLLOW_SYMLINKS`
    - `CODEBASE_SEARCH_FOLLOW_EXTERNAL_SYMLINKS`
- Update `codebase-search.settings.example.jsonc` with new keys and comments.

**Commit safety**
- No scanner/indexer behavior changes yet.
- Existing tests should continue passing.

**Validation gate**
- `npm run test:focused`

---

### Phase 2 - Symlink-Aware Scanner Core

**Goal**
Implement filesystem traversal that can follow symlink targets safely.

**Changes**
- Refactor scanner logic currently inside `src/tools/codebase-search/indexer.ts` into a dedicated scanner unit (new module is acceptable if it improves testability).
- Add symlink handling for `Dirent.isSymbolicLink()`:
  - resolve links via `realpath`
  - stat resolved targets
  - branch for file target vs directory target
- Add real-path loop protection for directories (visited set by resolved directory path).
- Enforce external-target behavior via `followExternalSymlinks`:
  - when `false`: skip targets outside worktree
  - when `true`: include them

**Commit safety**
- Scanner can be tested in isolation before full indexer integration.

**Validation gate**
- Run focused scanner tests introduced in this phase.

---

### Phase 3 - Indexer Integration

**Goal**
Use symlink-aware scanner results in incremental/full indexing without breaking cache/search semantics.

**Changes**
- Update `src/tools/codebase-search/indexer.ts` to consume scanner output that carries:
  - logical relative path (for cache key + payload)
  - read path (for file IO)
- Ensure cache hashing and delete/reindex behavior still key off logical paths.
- Ensure Qdrant payload `filePath` remains logical alias path expected by existing path filters.
- Keep skip counting behavior deterministic for broken/unreadable links.

**Commit safety**
- No schema migration needed.
- Existing query and path-prefix filtering should remain compatible.

**Validation gate**
- `npm run test:focused`

---

### Phase 4 - Symlink Regression Matrix

**Goal**
Lock behavior with deterministic tests for symlink and external-target traversal.

**Test cases**
- Follows symlinked file inside worktree.
- Follows symlinked directory inside worktree.
- Follows symlink target outside worktree when external-follow is enabled.
- Skips outside-worktree target when external-follow is disabled.
- Avoids infinite recursion on cyclic symlink directories.
- Skips broken symlink without failing full scan.
- Honors `.ignore` exclusion on logical symlink path.

**Proposed files**
- `src/tools/codebase-search/__tests__/scanner-symlink.test.ts` (new)
- update existing tests only if needed for shared helpers.

**Validation gate**
- `npm run test:focused`

---

### Phase 5 - Documentation and Release Gates

**Goal**
Document behavior and complete repository quality gates.

**Changes**
- Update `src/tools/codebase-search/README.md`:
  - symlink behavior
  - external-target policy
  - loop/broken-link handling notes
- Update root `README.md` config guidance if settings surface is user-facing.
- Ensure example settings include both new symlink controls.

**Validation gate**
- `npm run sync:opencode`
- `npm run test:focused`
- `npm run verify:release`

**Release hygiene note**
- Do not commit generated runtime artifacts (`.opencode/`) or other ignored local artifacts.

## Proposed Commit Sequence

1. `feat(config): add symlink traversal settings and env toggles`
2. `feat(indexer): add symlink-aware scanner with loop protection`
3. `feat(indexer): integrate scanner output into cache/index pipeline`
4. `test(indexer): add symlink traversal regression coverage`
5. `docs(indexer): document symlink and external target behavior`

## Completion Criteria

- Query/background indexing can include symlink targets as configured.
- External targets are supported when enabled.
- No recursion loops or hard failures from broken links.
- Search results continue using logical, stable paths.
- Focused tests and release verification pass.
