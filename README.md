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
3. Optionally set `CODEBASE_SEARCH_SETTINGS_FILE`.

If Qdrant auth is disabled, set `qdrantApiKey` to `""` or omit it.

Settings resolution order:

1. `CODEBASE_SEARCH_SETTINGS_FILE`
2. `<worktree>/.opencode/codebase-search.settings.jsonc`
3. `~/.config/opencode/codebase-search.settings.jsonc`

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

## Docs

- `instructions/codebase-search.md`
- `docs/ARCHITECTURE.md`
- `docs/RELEASING.md`
- `CHANGELOG.md`
