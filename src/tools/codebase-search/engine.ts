import { canSearchExistingIndex, ensureIndexFresh, searchIndex } from "./indexer"
import { loadIndexConfig, validateProviderConfig } from "./config"
import { createEmbedder } from "./embedders"
import { getBackgroundIndexStatus, scheduleBackgroundIndex } from "./background-index-queue"
import { rerankSearchResults } from "./ranking"
import type { SearchRequest, SearchResponse } from "./types"

export async function runCodebaseSearch(request: SearchRequest, worktree: string): Promise<SearchResponse> {
	const config = loadIndexConfig(worktree, request.mode)
	if (request.maxResults && request.maxResults > 0) {
		config.searchMaxResults = request.maxResults
	}

	validateProviderConfig(config)
	const embedder = createEmbedder(config)

	let indexing = {
		mode: config.indexMode,
		performed: false,
		triggered: false,
		reason: "not-requested",
	}

	if (config.indexMode === "query") {
		const indexingSummary = await ensureIndexFresh(config, embedder)
		indexing = {
			mode: indexingSummary.mode,
			performed: indexingSummary.performed,
			triggered: indexingSummary.triggered,
			reason: indexingSummary.reason,
			processedFiles: indexingSummary.processedFiles,
			skippedFiles: indexingSummary.skippedFiles,
			indexedBlocks: indexingSummary.indexedBlocks,
			deletedFiles: indexingSummary.deletedFiles,
		}
	}

	if (config.indexMode === "background") {
		scheduleBackgroundIndex(worktree, "codebase_search", true)
		const status = getBackgroundIndexStatus(worktree)
		indexing = {
			mode: "background",
			performed: false,
			triggered: true,
			reason: status.running || status.pending ? "background-refresh-scheduled" : "background-idle",
		}
	}

	if (config.indexMode === "disabled") {
		const canSearch = await canSearchExistingIndex(config)
		indexing = {
			mode: "disabled",
			performed: false,
			triggered: false,
			reason: canSearch ? "search-only-existing-index" : "no-existing-index",
		}
	}

	const rawResults = await searchIndex(config, embedder, request.query, request.path)
	const rerankedResults = rerankSearchResults(rawResults, request.query)

	const results = rerankedResults.map((result) => ({
		filePath: result.payload.filePath,
		score: result.score,
		startLine: result.payload.startLine,
		endLine: result.payload.endLine,
		codeChunk: result.payload.codeChunk.trim(),
	}))

	return {
		query: request.query,
		mode: config.indexMode,
		path: request.path || null,
		indexing,
		results,
	}
}
