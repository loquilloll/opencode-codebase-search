# opencode-codebase-search

Semantic `codebase_search` implementation for OpenCode with Roo behavior parity.

## What this provides

- A production `codebase_search` tool implementation under `src/tools/`.
- A background indexing plugin under `src/plugins/`.
- Generated runtime payload support via `npm run sync:opencode`.
- Manual semantic-versioned release packaging for GitHub Releases.

## Install

```bash
npm install --no-audit --no-fund
```

## Generate runtime payload

```bash
npm run sync:opencode
```

This generates `.opencode/` from `src/`.

## Install globally for OpenCode config

These are the exact steps used to install globally under `~/.config/opencode`.

1. Generate runtime files from source:

```bash
npm run sync:opencode
```

2. Copy tool and plugin files into global OpenCode directories:

```bash
mkdir -p "$HOME/.config/opencode/tools" "$HOME/.config/opencode/plugins"
rm -rf "$HOME/.config/opencode/tools/codebase-search"
cp -f ".opencode/tools/codebase_search.ts" "$HOME/.config/opencode/tools/codebase_search.ts"
cp -R ".opencode/tools/codebase-search" "$HOME/.config/opencode/tools/codebase-search"
cp -f ".opencode/plugins/codebase-index-worker.ts" "$HOME/.config/opencode/plugins/codebase-index-worker.ts"
```

3. Install runtime dependencies into `~/.config/opencode`:

```bash
cd "$HOME/.config/opencode"
npm install --no-audit --no-fund
```

If needed, ensure `~/.config/opencode/package.json` includes these dependencies:

- `@aws-sdk/client-bedrock-runtime`
- `@aws-sdk/credential-providers`
- `@opencode-ai/plugin`
- `@qdrant/js-client-rest`
- `ignore`
- `jsonc-parser`
- `tree-sitter-wasms`
- `uuid`
- `web-tree-sitter`

4. Install your personal settings globally:

```bash
cp -f "codebase-search.settings.jsonc" "$HOME/.config/opencode/codebase-search.settings.jsonc"
```

5. Verify global availability outside this repository:

```bash
opencode run -m openai/gpt-5.3-codex --format json --dir "$HOME" \
  "Use ONLY the codebase_search tool. Call it with query 'password hashing', mode 'disabled', and maxResults 1. Return exactly the JSON result."
```

## Configure settings

1. Copy `codebase-search.settings.example.jsonc` to `codebase-search.settings.jsonc`.
2. Fill provider/model/Qdrant values.
3. Optionally point to a custom settings path with `CODEBASE_SEARCH_SETTINGS_FILE`.

`codebase-search.settings.jsonc` is local and gitignored.

Settings resolution order:

1. `CODEBASE_SEARCH_SETTINGS_FILE` (if set)
2. `<worktree>/.opencode/codebase-search.settings.jsonc`
3. `~/.config/opencode/codebase-search.settings.jsonc`

## Mode behavior

- `disabled`: search existing index only.
- `query`: refresh index before search.
- `background`: return immediately and schedule refresh.

## OpenCode config prompt guidance

If you set tool behavior via OpenCode config/system prompt, use this minimal policy:

- call `codebase_search` first for questions about where/how code is implemented
- use `query` when freshness matters, otherwise `disabled`
- ground final answers in tool results and include file paths/snippets

## Release docs

- `docs/ARCHITECTURE.md`
- `docs/RELEASING.md`
- `CHANGELOG.md`
