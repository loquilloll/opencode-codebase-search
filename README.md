# opencode-codebase-search

Semantic `codebase_search` for OpenCode.

Adapted from Roo Code's `codebase_search` implementation and prompt contract.

## What this repo provides

- Tool source: `src/tools/codebase_search.ts` and `src/tools/codebase-search/`
- Background plugin: `src/plugins/codebase-index-worker.ts`
- Generated runtime payload: `.opencode/` via `npm run sync:opencode`

The tool works without Roo Code running.

## Quick start

```bash
npm install --no-audit --no-fund
npm run sync:opencode
```

## Install globally for OpenCode

```bash
npm run sync:opencode
mkdir -p "$HOME/.config/opencode/tools" "$HOME/.config/opencode/plugins"
mkdir -p "$HOME/.config/opencode/instructions"
rm -rf "$HOME/.config/opencode/tools/codebase-search"
cp -f ".opencode/tools/codebase_search.ts" "$HOME/.config/opencode/tools/codebase_search.ts"
cp -R ".opencode/tools/codebase-search" "$HOME/.config/opencode/tools/codebase-search"
cp -f ".opencode/plugins/codebase-index-worker.ts" "$HOME/.config/opencode/plugins/codebase-index-worker.ts"
cp -f "instructions/codebase-search.md" "$HOME/.config/opencode/instructions/codebase-search.md"
cd "$HOME/.config/opencode" && npm install --no-audit --no-fund
cp -f "codebase-search.settings.jsonc" "$HOME/.config/opencode/codebase-search.settings.jsonc"
```

Also ensure `~/.config/opencode/opencode.jsonc` includes this in `instructions`:

```json
"~/.config/opencode/instructions/codebase-search.md"
```

Verify from outside this repo:

```bash
opencode run -m openai/gpt-5.3-codex --format json --dir "$HOME" \
  "Use ONLY the codebase_search tool. Call it with query 'password hashing', mode 'disabled', and maxResults 1. Return exactly the JSON result."
```

## Configure settings

1. Copy `codebase-search.settings.example.jsonc` to `codebase-search.settings.jsonc`.
2. Set provider/model/Qdrant values.
3. Configure symlink traversal if needed:
   - `followSymlinks` (default `true`)
   - `followExternalSymlinks` (default `true`)
4. Optionally set `CODEBASE_SEARCH_SETTINGS_FILE`.

If Qdrant auth is disabled, set `qdrantApiKey` to `""` or omit it.

`npm run sync:opencode` does not generate `<worktree>/.opencode/codebase-search.settings.jsonc`, so global settings remain active unless you intentionally create a worktree-local settings file.

Settings resolution order:

1. `CODEBASE_SEARCH_SETTINGS_FILE`
2. `<worktree>/.opencode/codebase-search.settings.jsonc` (if present)
3. `~/.config/opencode/codebase-search.settings.jsonc`

Env overrides for symlink behavior:

- `CODEBASE_SEARCH_FOLLOW_SYMLINKS`
- `CODEBASE_SEARCH_FOLLOW_EXTERNAL_SYMLINKS`

Cache file location:

- Canonical cache path: `~/.local/share/opencode-codebase-search/ws-<sha256(worktree)[:16]>.cache.json`
- Legacy cache path: `<worktree>/.opencode/codebase-search/ws-<sha256(worktree)[:16]>.cache.json`
- On first load after upgrade, the tool moves a legacy cache file to the canonical path when the canonical file does not exist.
- If both files exist, the canonical file is used and legacy cleanup is attempted best-effort.

## Qdrant with Docker Compose

`docker-compose.yml`:

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    restart: unless-stopped
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./qdrant-storage:/qdrant/storage
```

Start and verify:

```bash
docker compose up -d
curl -fsS http://127.0.0.1:6333/collections
```

Use:

- `qdrantUrl`: `http://127.0.0.1:6333`
- `qdrantApiKey`: `""` (or omit) when auth is disabled

## Index behavior and Roo coexistence

If Roo Code and OpenCode share the same worktree and Qdrant, both can update the same collection.

- `disabled`: no index update; search current index state
- `query`: refresh/reconcile index before search
- `background`: return immediately and schedule refresh (plugin events can also schedule refresh)

Concurrent indexing can increase write load, but updates are idempotent by segment hash.

## Index status

Use the index-status CLI to inspect index health without triggering indexing writes:

```bash
npm run index:status -- --worktree .
```

Watch mode (polling diagnostics):

```bash
npm run index:status -- --worktree . --watch --interval-ms 2000
```

Supported flags:

- `--worktree <path>`: target workspace path (default current directory)
- `--timeout-ms <ms>`: timeout for Qdrant probes
- `--skip-diff`: skip dry-run reconciliation diff (faster, less query/background certainty)
- `--no-skip-diff`: force dry-run diff (useful in watch mode because watch defaults to `--skip-diff`)
- `--watch`: keep polling status until interrupted
- `--interval-ms <ms>`: polling interval used with `--watch`
- `--json`: pretty JSON output
- `--compact`: compact JSON output (watch emits NDJSON line-per-iteration)
- `--help`: show CLI usage

Diagnostic value by mode:

- `disabled`: confirms whether current indexed points/metadata are sufficient for immediate search-only queries
- `query`: estimates reconciliation workload (changed/new/deleted files, estimated blocks/batches) before a query-triggered refresh
- `background`: shows freshness/staleness risk using last completion time plus pending reconciliation workload

## Docs

- `instructions/codebase-search.md`
- `docs/ARCHITECTURE.md`
- `docs/RELEASING.md`
- `CHANGELOG.md`
