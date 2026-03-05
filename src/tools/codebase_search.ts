import { tool } from "@opencode-ai/plugin"

import { runCodebaseSearch } from "./codebase-search/engine"

export default tool({
	description:
		"Find code snippets relevant to a semantic query. Supports index modes: disabled (default), query, and background.",
	args: {
		query: tool.schema.string().describe("Semantic search query (English preferred)."),
		path: tool.schema.string().nullable().optional().describe("Optional relative subdirectory filter."),
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
