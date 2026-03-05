export type IndexMode = "disabled" | "query" | "background"

export type EmbedderProvider =
	| "openai"
	| "ollama"
	| "openai-compatible"
	| "gemini"
	| "mistral"
	| "vercel-ai-gateway"
	| "bedrock"
	| "openrouter"

export interface SearchRequest {
	query: string
	path?: string | null
	mode?: IndexMode
	maxResults?: number
}

export interface CodeSearchResult {
	filePath: string
	score: number
	startLine: number
	endLine: number
	codeChunk: string
}

export interface IndexingSummary {
	mode: IndexMode
	performed: boolean
	triggered: boolean
	reason: string
	processedFiles?: number
	skippedFiles?: number
	indexedBlocks?: number
	deletedFiles?: number
}

export interface SearchResponse {
	query: string
	mode: IndexMode
	path: string | null
	indexing: IndexingSummary
	results: CodeSearchResult[]
}

export interface EmbeddingResponse {
	embeddings: number[][]
	usage?: {
		promptTokens: number
		totalTokens: number
	}
}

export interface Embedder {
	provider: EmbedderProvider
	model: string
	createEmbeddings(texts: string[]): Promise<EmbeddingResponse>
	validateConfiguration(): Promise<{ valid: boolean; error?: string }>
}

export interface QueryResult {
	score: number
	payload: {
		filePath: string
		codeChunk: string
		startLine: number
		endLine: number
		segmentHash?: string
	}
}

export interface IndexPoint {
	id: string
	vector: number[]
	payload: {
		filePath: string
		codeChunk: string
		startLine: number
		endLine: number
		segmentHash: string
	}
}

export interface ParsedBlock {
	filePath: string
	startLine: number
	endLine: number
	content: string
	segmentHash: string
	fileHash: string
}

export interface IndexConfig {
	worktree: string
	indexMode: IndexMode
	provider: EmbedderProvider
	modelId: string
	modelDimension?: number
	qdrantUrl: string
	qdrantApiKey?: string
	searchMinScore?: number
	searchMaxResults?: number
	openAiApiKey?: string
	openAiBaseUrl?: string
	ollamaBaseUrl?: string
	openAiCompatibleBaseUrl?: string
	openAiCompatibleApiKey?: string
	geminiApiKey?: string
	mistralApiKey?: string
	vercelAiGatewayApiKey?: string
	bedrockRegion?: string
	bedrockProfile?: string
	openRouterApiKey?: string
	openRouterSpecificProvider?: string
	cacheFilePath: string
}
