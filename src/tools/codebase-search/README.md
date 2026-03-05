# codebase_search Tool (OpenCode)

This directory contains a self-contained semantic `codebase_search` implementation for OpenCode.

## Files

- `src/tools/codebase_search.ts`: tool entrypoint
- `src/plugins/codebase-index-worker.ts`: background indexing plugin worker
- `src/tools/codebase-search/*`: indexing/search engine modules

Generated runtime layout:

- `.opencode/tools/`
- `.opencode/plugins/`

Generate `.opencode/` from source with:

- `npm run sync:opencode`

## Index Modes

- `disabled` (default): search existing index only, no indexing work
- `query`: run incremental indexing before search
- `background`: schedule background indexing, return search immediately

Set mode with:

- env: `CODEBASE_SEARCH_INDEX_MODE`
- per tool call arg: `mode`

## JSONC Settings File

Configure tool settings in:

- `.opencode/codebase-search.settings.jsonc` (runtime default)

Repository template settings file:

- `codebase-search.settings.example.jsonc`

You can override the file location with:

- `CODEBASE_SEARCH_SETTINGS_FILE`

Config precedence is:

- per-tool arg override
- environment variables
- `.opencode/codebase-search.settings.jsonc`
- built-in defaults

String fields in the JSONC file support command substitution:

- Example: `"geminiApiKey": "$(pass show gemini)"`

The command runs with `/bin/sh` in the workspace root and must complete within 15 seconds.

## Required Core Environment

- `CODEBASE_SEARCH_PROVIDER` (default: `openai`)
- `CODEBASE_SEARCH_MODEL_ID` (optional, provider default used otherwise)
- `CODEBASE_SEARCH_MODEL_DIMENSION` (recommended if using custom models)
- `CODEBASE_SEARCH_QDRANT_URL` (default: `http://localhost:6333`)
- `CODEBASE_SEARCH_QDRANT_API_KEY` (optional)
- `CODEBASE_SEARCH_FOLLOW_SYMLINKS` (optional, default: `true`)
- `CODEBASE_SEARCH_FOLLOW_EXTERNAL_SYMLINKS` (optional, default: `true`)

## Symlink Traversal

JSONC settings keys:

- `followSymlinks` (default: `true`)
- `followExternalSymlinks` (default: `true`)

Behavior:

- when `followSymlinks` is `false`, symbolic links are skipped
- when `followSymlinks` is `true`, symlinked files and directories are traversed
- when `followExternalSymlinks` is `false`, symlink targets resolving outside the worktree are skipped
- when `followExternalSymlinks` is `true`, external symlink targets are included
- cyclic directory links are prevented from recursing infinitely using resolved-realpath loop guards
- broken or unreadable symlink targets are skipped without failing the full index pass
- indexed file paths remain logical workspace paths (the symlink alias path), while file reads and parser extension detection use resolved target paths

## Provider Environment

### openai

- `CODEBASE_SEARCH_OPENAI_API_KEY` (or `OPENAI_API_KEY`)
- `CODEBASE_SEARCH_OPENAI_BASE_URL` (optional, default OpenAI URL)

### ollama

- `CODEBASE_SEARCH_OLLAMA_BASE_URL` (default `http://localhost:11434`)

### openai-compatible

- `CODEBASE_SEARCH_OPENAI_COMPAT_BASE_URL`
- `CODEBASE_SEARCH_OPENAI_COMPAT_API_KEY`

### gemini

- `CODEBASE_SEARCH_GEMINI_API_KEY`

### mistral

- `CODEBASE_SEARCH_MISTRAL_API_KEY`

### vercel-ai-gateway

- `CODEBASE_SEARCH_VERCEL_AI_GATEWAY_API_KEY`

### bedrock

- `CODEBASE_SEARCH_BEDROCK_REGION`
- `CODEBASE_SEARCH_BEDROCK_PROFILE` (optional)

### openrouter

- `CODEBASE_SEARCH_OPENROUTER_API_KEY`
- `CODEBASE_SEARCH_OPENROUTER_PROVIDER` (optional specific provider routing)

## Compatibility Notes

- Reuses Roo collection naming (`ws-${sha256(worktree).slice(0,16)}`)
- Reuses Roo point ID namespace (`uuidv5(segmentHash, QDRANT_CODE_BLOCK_NAMESPACE)`)
- Reuses metadata marker ID and fields (`__indexing_metadata__`, `indexing_complete`)
- Uses path-segment payload filters for directory-prefix scoping
- If an existing Roo index is found and local cache is missing, query mode performs one-time reconciliation (no duplicate collection creation)
- If collection dimension differs from active model dimension, collection is recreated to match Roo behavior
- Cache file is stored per workspace at `~/.local/share/opencode-codebase-search/ws-<sha256(worktree)[:16]>.cache.json`
- Legacy workspace-local cache (`<worktree>/.opencode/codebase-search/ws-<sha256(worktree)[:16]>.cache.json`) is moved on first load when canonical cache is missing

## Ignore Behavior

Scanner ignore sources are applied in this order:

- default internal ignore patterns
- `.gitignore`
- `.rooignore`
- `.ignore` (OpenCode first-class override)

`.ignore` is applied last so it can override earlier rules.

Directory rules are matched with both `path` and `path/` forms for parity with Roo ignore behavior (for example `src/generated/`).

## Ranking Behavior

- Base ranking uses vector similarity from Qdrant.
- A light post-rank heuristic is applied for code-first relevance:
    - code-centric queries slightly prefer source files over docs-like files (`.md`, `.markdown`, `.txt`, `.rst`, `.adoc`)
    - docs-focused queries (for example containing `readme`, `docs`, `documentation`, `guide`, `tutorial`) slightly prefer docs-like files
- Reported `score` values remain the raw vector similarity scores.

## Background Worker

The plugin listens to:

- `session.created`
- `file.watcher.updated`
- `session.idle`

It schedules debounced, single-flight background indexing when mode is `background`.
