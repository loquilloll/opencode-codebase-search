Find files most relevant to the search query using semantic search. Search by meaning rather than exact text matches. By default, search the entire workspace. Reuse the user's exact wording unless there is a clear reason not to. Queries must be in English (translate if needed).

This tool works without Roo Code running. Roo Code can be running at the same time; shared Qdrant/worktree indexing is expected.

CRITICAL: For any exploration of code not yet examined in the current conversation, use `codebase_search` first before other search or file exploration tools. This applies throughout the full conversation, not just at the beginning.

Parameter policy:
- `query` (required): meaning-based search query; reuse user phrasing when possible.
- `path` (optional): relative subdirectory scope; omit for workspace-wide search.
- `mode` (optional): `disabled | query | background`.
- `maxResults` (optional): limit number of returned results.

Index trigger implications:
- `disabled`: do not trigger indexing; search current index state only.
- `query`: trigger freshness/index reconciliation before search.
- `background`: return quickly and schedule background refresh; plugin events may also schedule refresh.

When Roo and OpenCode are both active on the same worktree and Qdrant:
- either tool may update the shared collection
- `disabled` mode results can include updates written by Roo
- concurrent indexing may increase write load but updates are safe/idempotent by segment hash

Response policy:
- Ground claims in `codebase_search` results.
- Include file paths from tool output.
- If results are weak, retry once with a shorter focused query.
