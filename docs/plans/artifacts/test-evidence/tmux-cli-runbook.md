# tmux-cli Runbook for Live `codebase_search` Validation

## Purpose
Run repeatable, non-interactive live tests that prove OpenCode can invoke the `codebase_search` tool and that indexing mode behavior matches the plan.

## Preconditions
- `tmux-cli` is installed and working (`tmux-cli --help`).
- `opencode` is available on PATH.
- Qdrant is reachable for the configured URL.
- The custom tool implementation is present in `.opencode/tools/`.

## Fixture Workspace
Use this sample codebase for repeatable semantic queries:

- `docs/plans/artifacts/test-fixtures/mini-shop`

Launch OpenCode from that directory so `context.worktree` resolves to the fixture workspace.

Important:
- The fixture must be its own git worktree root.
- If not, `context.worktree` may resolve to the parent repository and queries will hit the wrong index collection.

Initialize once (local only, do not commit fixture `.git`):

```bash
cd /home/<user>/Documents/pgit/opencode-codebase-search/docs/plans/artifacts/test-fixtures/mini-shop
git init
```

Quick check:
```bash
cd /home/<user>/Documents/pgit/opencode-codebase-search/docs/plans/artifacts/test-fixtures/mini-shop
git rev-parse --show-toplevel
# should print the mini-shop path itself
```

Set settings file (recommended for repeatable runs):

- `CODEBASE_SEARCH_SETTINGS_FILE=/home/<user>/Documents/pgit/opencode-codebase-search/codebase-search.settings.jsonc`

## Pane Layout
- Server pane: runs `opencode serve`.
- Runner pane: executes `opencode run --attach ...` prompts.
- Optional verify pane: inspects logs/Qdrant state.

## One-Time Setup
```bash
tmux-cli launch "zsh"   # server pane
tmux-cli launch "zsh"   # runner pane
tmux-cli launch "zsh"   # verify pane (optional)
tmux-cli list_panes
```

Save the pane IDs as:
- `SERVER_PANE`
- `RUNNER_PANE`
- `VERIFY_PANE` (optional)

## Base Server Start
```bash
tmux-cli send "cd /home/<user>/Documents/pgit/opencode-codebase-search/docs/plans/artifacts/test-fixtures/mini-shop && CODEBASE_SEARCH_SETTINGS_FILE=/home/<user>/Documents/pgit/opencode-codebase-search/codebase-search.settings.jsonc opencode serve --port 0 --hostname 127.0.0.1" --pane=<SERVER_PANE>
tmux-cli wait_idle --pane=<SERVER_PANE> --idle-time=2 --timeout=30
tmux-cli capture --pane=<SERVER_PANE>
```

If the server is long-running and does not become idle, skip `wait_idle` and verify startup with `capture`.

From server capture output, copy the printed URL:

- Example: `opencode server listening on http://127.0.0.1:46013`
- Save as `SERVER_URL` for the runner commands below.

## Canonical Tool-Trigger Prompt
```bash
tmux-cli execute "opencode run --attach <SERVER_URL> --format json --dir /home/<user>/Documents/pgit/opencode-codebase-search/docs/plans/artifacts/test-fixtures/mini-shop 'Use ONLY the codebase_search tool. Call it with query \"password hashing and verification\", mode \"disabled\", and maxResults 3. Return exactly the JSON result.'" --pane=<RUNNER_PANE> --timeout=240
```

Expected evidence:
- JSON output includes a `codebase_search` tool invocation event.
- Response includes ranked snippet results or a clear status message.

## Mode Matrix Procedure
Run all three modes and capture output after each run.

### 1) `disabled`
```bash
tmux-cli execute "opencode run --attach <SERVER_URL> --format json --dir /home/<user>/Documents/pgit/opencode-codebase-search/docs/plans/artifacts/test-fixtures/mini-shop 'Use ONLY the codebase_search tool. Call it with query \"where are passwords hashed and verified\", mode \"disabled\", and maxResults 3. Return exactly the JSON result.'" --pane=<RUNNER_PANE> --timeout=240
```
Verify:
- No indexing writes initiated by OpenCode path.
- Search uses existing index only.

### 2) `query`
```bash
tmux-cli execute "opencode run --attach <SERVER_URL> --format json --dir /home/<user>/Documents/pgit/opencode-codebase-search/docs/plans/artifacts/test-fixtures/mini-shop 'Use ONLY the codebase_search tool. Call it with query \"where is password hashing implemented\", mode \"query\", and maxResults 3. Return exactly the JSON result.'" --pane=<RUNNER_PANE> --timeout=300
```
Verify:
- Incremental indexing runs before search returns.

### 3) `background`
```bash
tmux-cli execute "opencode run --attach <SERVER_URL> --format json --dir /home/<user>/Documents/pgit/opencode-codebase-search/docs/plans/artifacts/test-fixtures/mini-shop 'Use ONLY the codebase_search tool. Call it with query \"payment retry exponential backoff\", mode \"background\", and maxResults 3. Return exactly the JSON result.'" --pane=<RUNNER_PANE> --timeout=240
```
Verify:
- Query returns immediately (non-blocking path).
- Urgent background indexing is scheduled when stale/missing.

## Qdrant No-Duplicate-Collection Check
Use the workspace-hash rule and verify only one collection is reused.

```bash
# In repo root
node -e "const {createHash}=require('crypto');const p=process.cwd();console.log('ws-'+createHash('sha256').update(p).digest('hex').slice(0,16))"
```

Then inspect Qdrant collections and confirm no second workspace collection is created.

## Evidence Capture Checklist
For each mode, save:
- Runner JSON output snippet showing `codebase_search` invocation.
- Server logs around indexing/search timing.
- Latency note (start -> response).
- Qdrant collection check result.

Suggested storage:
- `docs/plans/artifacts/test-evidence/live-disabled.md`
- `docs/plans/artifacts/test-evidence/live-query.md`
- `docs/plans/artifacts/test-evidence/live-background.md`

## Cleanup
```bash
tmux-cli interrupt --pane=<SERVER_PANE>
tmux-cli cleanup
```

## Fallback (No tmux)
If tmux orchestration is unavailable, run the same flow with direct terminals:
- terminal 1: `opencode serve`
- terminal 2: `opencode run --attach ...`
