import { tool } from "@opencode-ai/plugin"

import { runCodebaseSearch } from "./codebase-search/engine"

const CODEBASE_SEARCH_DESCRIPTION = `Find files most relevant to the search query using semantic search. Searches based on meaning rather than exact text matches. By default searches entire workspace. Reuse the user's exact wording unless there's a clear reason not to - their phrasing often helps semantic search. Queries MUST be in English (translate if needed).

**CRITICAL: For ANY exploration of code you haven't examined yet in this conversation, you MUST use this tool FIRST before any other search or file exploration tools.** This applies throughout the entire conversation, not just at the beginning. This tool uses semantic search to find relevant code based on meaning rather than just keywords, making it far more effective than regex-based search tools for understanding implementations. Even if you've already explored some code, any new area of exploration requires codebase_search first.

Parameters:
- query: (required) The search query. Reuse the user's exact wording/question format unless there's a clear reason not to.
- path: (optional) Limit search to specific subdirectory (relative to the current workspace directory). Leave empty for entire workspace.
- mode: (optional) Override indexing mode for this call: disabled | query | background.
- maxResults: (optional) Maximum number of results to return.`

const QUERY_PARAMETER_DESCRIPTION = "Meaning-based search query describing the information you need"

const PATH_PARAMETER_DESCRIPTION = "Optional subdirectory (relative to the workspace) to limit the search scope"

export default tool({
	description: CODEBASE_SEARCH_DESCRIPTION,
	args: {
		query: tool.schema.string().describe(QUERY_PARAMETER_DESCRIPTION),
		path: tool.schema.string().nullable().optional().describe(PATH_PARAMETER_DESCRIPTION),
		mode: tool.schema
			.enum(["disabled", "query", "background"])
			.optional()
			.describe("Optional index mode override for this call."),
		maxResults: tool.schema.number().int().positive().max(200).optional().describe("Optional result limit."),
	},
	async execute(args, context) {
		if (!args.query || args.query.trim() === "") {
			throw new Error("Missing required 'query' parameter.")
		}

		const worktree = context.worktree || context.directory
		if (!worktree) {
			throw new Error("Could not determine worktree path from OpenCode context.")
		}

		const response = await runCodebaseSearch(
			{
				query: args.query,
				path: args.path,
				mode: args.mode,
				maxResults: args.maxResults,
			},
			worktree,
		)

		return JSON.stringify(response, null, 2)
	},
})
