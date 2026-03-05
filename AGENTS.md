# AGENTS
Guidelines for coding agents and contributors in this repository.

## 1) Scope And Priority
- Canonical source of truth is `src/`.
- Generated runtime output is `.opencode/`.
- Do not hand-edit `.opencode/`; regenerate from `src/`.
- Use this file as the default contributor/agent contract.

## 2) Cursor/Copilot Rule Sources
Checked paths in this repo:
- `.cursor/rules/` -> not present
- `.cursorrules` -> not present
- `.github/copilot-instructions.md` -> not present
If these files are added later, apply them in addition to this document.

## 3) Repository Map
- `src/tools/codebase_search.ts` - OpenCode tool entrypoint
- `src/tools/codebase-search/` - core index/search implementation
- `src/tools/codebase-search/status.ts` - read-only index status collector and diagnostics
- `src/plugins/codebase-index-worker.ts` - background indexing plugin
- `scripts/codebase-index-status.ts` - index status CLI (one-shot + watch)
- `scripts/sync-opencode.mjs` - generate `.opencode/` runtime from `src/`
- `scripts/verify-release.mjs` - enforce runtime/release boundaries
- `scripts/build-release.mjs` - create release tarball in `dist/`
- `docs/ARCHITECTURE.md` - architecture notes
- `docs/RELEASING.md` - semantic version and release procedure
- `docs/plans/` - development plans/evidence (dev-only)
- `docs/CONTINUITY.md` - continuity log

## 4) Build / Lint / Test Commands
Run all commands from repository root.

### Install
```bash
npm install --no-audit --no-fund
```

### Build / Generate Runtime
```bash
npm run sync:opencode
```

### Index Diagnostics
```bash
npm run index:status
```

### Tests (focused suite)
```bash
npm run test:focused
```

### Single Test File (important)
```bash
npx --yes tsx --test "src/tools/codebase-search/__tests__/ignore.test.ts"
npx --yes tsx --test "src/tools/codebase-search/__tests__/ranking.test.ts"
```

### Verification / Packaging
```bash
npm run verify:release
npm run build:release
npm run release:prep
```

### Lint / Typecheck Status
- No dedicated `npm run lint` script currently exists.
- No dedicated `npm run typecheck` script currently exists.
- Current quality gates are tests + runtime generation + release verification.

## 5) Required Workflow After Source Edits
1. Edit source under `src/` (plus docs/scripts when needed).
2. Run `npm run sync:opencode`.
3. Run `npm run test:focused` (or single-file test while iterating).
4. Run `npm run verify:release` before finalizing.
5. Run `npm run build:release` only when preparing local release artifacts.

## 6) Code Style Guidelines

### 6.1 Language And Modules
- Use TypeScript and ESM imports/exports.
- Prefer `import type` for type-only imports.
- Use Node built-in specifiers when applicable (`node:test`, `node:assert/strict`).

### 6.2 Import Ordering
Group imports in this order:
1. Node built-ins
2. Third-party packages
3. Local project modules
4. Type-only imports
Keep one blank line between groups and remove unused imports.

### 6.3 Formatting
- Indent with tabs.
- Use double-quoted strings.
- Omit semicolons.
- Keep trailing commas in multiline objects/calls where already used.
- Keep functions focused; extract helpers before logic gets too long.

### 6.4 Naming
- Variables/functions: `camelCase`
- Classes/interfaces/types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Most filenames: `kebab-case.ts`
- Intentional exception: `src/tools/codebase_search.ts` (do not rename)

### 6.5 Types
- Add explicit return types to exported functions.
- Reuse shared shapes from `types.ts` in each module area.
- Prefer `unknown` + narrowing for external values.
- Use `any` only at unavoidable third-party boundaries (usually caught errors).

### 6.6 Error Handling
- Throw actionable errors that include operation context.
- Preserve underlying cause/details when wrapping failures.
- Keep non-fatal fallbacks explicit (`return false`, `return undefined`) only when intentional.
- Avoid swallowing errors silently unless behavior explicitly requires degradation.

### 6.7 Async / Concurrency
- Prefer `async`/`await` over nested `.then()` chains.
- Keep indexing/background operations single-flight where concurrency matters.
- Preserve non-blocking behavior for `background` mode query paths.

### 6.8 Filesystem / Paths
- Use `path.join`/`path.relative` instead of string concatenation.
- Normalize path separators for cross-platform comparisons.
- Keep generated artifacts and source artifacts clearly separated.

### 6.9 Tests
- Use Node test runner through `tsx --test`.
- Keep tests deterministic and behavior-oriented.
- Create temporary resources in tests and always clean them in `finally`.

## 7) Release And Distribution Rules
- Semantic versioning is required.
- Current first public tag target is `v0.1.0`.
- Release creation is manual via GitHub Releases.
- Do not auto-publish releases from scripts.
- Release assets must exclude development artifacts in `docs/plans/`.

## 8) Commit Hygiene
Do not commit these local/generated artifacts:
- `codebase-search.settings.jsonc`
- `.opencode/`
- `dist/`
- `node_modules/`

## 9) Privacy / PII
- Do not commit personally identifiable information (PII) such as usernames, personal home paths, email addresses, API keys, or host-specific machine identifiers.
- Use neutral placeholders in docs/examples (for example `/home/<user>/...`) instead of real local identities.
- When PII appears in tracked content, scrub it before commit and keep continuity notes anonymized.

## 10) Remote
- Expected origin: `git@github-loquilloll:loquilloll/opencode-codebase-search.git`
