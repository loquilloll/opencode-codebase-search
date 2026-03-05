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

## Configure settings

1. Copy `codebase-search.settings.example.jsonc` to `codebase-search.settings.jsonc`.
2. Fill provider/model/Qdrant values.
3. Optionally point to a custom settings path with `CODEBASE_SEARCH_SETTINGS_FILE`.

`codebase-search.settings.jsonc` is local and gitignored.

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
