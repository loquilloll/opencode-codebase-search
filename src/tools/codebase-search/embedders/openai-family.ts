import {
	BaseEmbedder,
	normalizeEmbeddingArray,
	requestOpenAICompatibleEmbeddings,
	resolveEmbeddingsEndpoint,
} from "./base"
import type { EmbedderProvider, EmbeddingResponse } from "../types"

type OpenAIFamilyOptions = {
	provider: EmbedderProvider
	apiKey: string
	baseUrl: string
	model: string
	specificProvider?: string
	extraHeaders?: Record<string, string>
}

export class OpenAIFamilyEmbedder extends BaseEmbedder {
	provider: EmbedderProvider
	model: string

	private readonly apiKey: string
	private readonly endpoint: string
	private readonly extraHeaders?: Record<string, string>
	private readonly specificProvider?: string

	constructor(options: OpenAIFamilyOptions) {
		super()
		this.provider = options.provider
		this.model = options.model
		this.apiKey = options.apiKey
		this.endpoint = resolveEmbeddingsEndpoint(options.baseUrl)
		this.extraHeaders = options.extraHeaders
		this.specificProvider = options.specificProvider
	}

	async createEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
		const processedTexts = this.applyQueryPrefixIfNeeded(texts)
		const chunks = this.chunkByTokenEstimate(processedTexts)

		const embeddings: number[][] = []
		let promptTokens = 0
		let totalTokens = 0

		for (const chunk of chunks) {
			const response = await this.withRetry(() =>
				requestOpenAICompatibleEmbeddings({
					endpoint: this.endpoint,
					apiKey: this.apiKey,
					model: this.model,
					input: chunk,
					extraHeaders: this.extraHeaders,
					extraBody:
						this.provider === "openrouter" && this.specificProvider
							? {
									provider: {
										order: [this.specificProvider],
										only: [this.specificProvider],
										allow_fallbacks: false,
									},
								}
							: undefined,
				}),
			)

			for (const item of response.data) {
				embeddings.push(normalizeEmbeddingArray(item.embedding))
			}

			promptTokens += response.usage?.prompt_tokens || 0
			totalTokens += response.usage?.total_tokens || 0
		}

		return {
			embeddings,
			usage: {
				promptTokens,
				totalTokens,
			},
		}
	}

	async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
		try {
			await this.createEmbeddings(["test"])
			return { valid: true }
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}
}
