# Live Smoke Evidence: JSONC Command Substitution

Date: 2026-02-15

## Goal
Verify that `.opencode/codebase-search.settings.jsonc` supports command substitution values like:

```jsonc
"geminiApiKey": "$(pass show gemini)"
```

## Run 1: Empty command substitution
Settings file:
- `docs/plans/artifacts/test-evidence/settings-cmdsub-empty.jsonc`

Command:
```bash
env CODEBASE_SEARCH_SETTINGS_FILE=/home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-evidence/settings-cmdsub-empty.jsonc \
  timeout 60 opencode run -m openai/gpt-5.3-codex --format json \
  --dir "/home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop" \
  "Use ONLY the codebase_search tool. Query: password hashing and verification. Return top 1 hit."
```

Observed result:
- Tool failed validation with missing Gemini API key.
- This confirms `"$(printf '')"` was executed and resolved to empty.

## Run 2: Non-empty command substitution
Settings file:
- `docs/plans/artifacts/test-evidence/settings-cmdsub-ok.jsonc`

Command:
```bash
env CODEBASE_SEARCH_SETTINGS_FILE=/home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-evidence/settings-cmdsub-ok.jsonc \
  timeout 60 opencode run -m openai/gpt-5.3-codex --format json \
  --dir "/home/<user>/Documents/pgit/Roo-Code/plans/artifacts/test-fixtures/mini-shop" \
  "Use ONLY the codebase_search tool. Query: password hashing and verification. Return top 1 hit."
```

Observed result:
- `codebase_search` tool call completed.
- Output returned:
  - `mode: "disabled"`
  - indexing reason `"no-existing-index"`
  - `results: []`

Interpretation:
- Non-empty command substitution resolved successfully.

## Additional Fix Verified During Smoke
- Fixed plugin mode check in `.opencode/plugins/codebase-index-worker.ts` to respect configured mode.
- Prior behavior incorrectly forced background mode by calling `loadIndexConfig(worktree, "background")`.
