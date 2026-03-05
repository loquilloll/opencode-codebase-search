# Repo Reorg + OpenCode Config Prompt Plan

## Goal

Clean up module structure for development and distribution while relying on OpenCode config + tool description for usage prompting.

## Constraints

- Canonical source remains in `src/`.
- Tool is loaded via OpenCode config.
- Keep release process semantic-versioned and manual (GitHub Releases).
- Exclude dev artifacts (`docs/plans/**`, fixtures, local settings) from release assets.

## Current Issues To Resolve

- Root metadata/docs are fixture-oriented (`README.md`, `package.json`) instead of project-oriented.
- `src/` mixes tool source with fixture/demo modules (`auth/`, `cache/`, `orders/`, `main.ts`, `types.ts`).
- Runtime/distribution boundaries are unclear in current layout.
- Prompt guidance exists in test docs but not as a canonical config snippet.

## Phase 1: Normalize Repository Identity

1. Replace root `README.md` with project/runtime README (end-user focused).
2. Replace root `package.json` with project scripts + semver metadata.
3. Keep `AGENTS.md` as contributor/agent workflow source.
4. Keep remote expectation `git@github-loquilloll:loquilloll/opencode-codebase-search.git`.

## Phase 2: Clean Module Structure

1. Keep only tool code in `src/`:
   - `src/tools/**`
   - `src/plugins/**`
2. Move fixture/demo modules from root `src/`:
   - `src/auth/**`
   - `src/cache/**`
   - `src/orders/**`
   - `src/main.ts`
   - `src/types.ts`
3. Keep fixture under:
   - `docs/plans/artifacts/test-fixtures/mini-shop/**`

## Phase 3: Runtime + Release Boundaries

1. Keep `.opencode/` generated-only (or absent from repo if loaded externally by config).
2. Keep `dist/` as generated release output only.
3. Confirm `.gitignore` excludes:
   - `.opencode/`
   - `dist/`
   - `node_modules/`
   - `codebase-search.settings.jsonc`
4. Keep release scripts aligned:
   - `sync:opencode` (optional if runtime is externalized)
   - `test:focused`
   - `verify:release`
   - `build:release`
   - `release:prep`

## Phase 4: Canonical OpenCode Prompting (Config)

Use this minimal tool-usage block in OpenCode config/system prompt:

When user asks where/how code is implemented, call `codebase_search` first.

Mode policy:

- `disabled`: fast lookup on existing index
- `query`: refresh index first when freshness matters
- `background`: non-blocking lookup and schedule refresh

Response policy:

- Ground claims in tool output only
- Include file paths and snippets in final answer

## Phase 5: Documentation Alignment

1. `README.md`: user/runtime usage only.
2. `AGENTS.md`: development workflow, style rules, test/release commands.
3. `docs/RELEASING.md`: semver + manual GitHub release flow.
4. `docs/ARCHITECTURE.md`: source/runtime boundaries and component map.

## Validation Checklist

1. `npm install --no-audit --no-fund`
2. `npm run test:focused`
3. Single-file tests:
   - `npx --yes tsx --test "src/tools/codebase-search/__tests__/ignore.test.ts"`
   - `npx --yes tsx --test "src/tools/codebase-search/__tests__/ranking.test.ts"`
4. `npm run verify:release`
5. `npm run build:release`
6. Inspect release archive contents; confirm no `docs/plans/**` or fixture files included.

## Definition Of Done

- `src/` contains only tool/plugin source.
- Root docs/package identify this as `opencode-codebase-search` project (not fixture).
- OpenCode config prompt block is canonical and concise.
- Release artifacts are reproducible and exclude development-only content.
- `AGENTS.md` guidance matches actual commands and file layout.
