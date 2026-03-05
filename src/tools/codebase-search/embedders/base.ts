import { MAX_BATCH_RETRIES, INITIAL_RETRY_DELAY_MS, MAX_BATCH_TOKENS, MAX_ITEM_TOKENS } from "../constants"
import { getModelQueryPrefix } from "../model-profiles"
import type { Embedder, EmbedderProvider, EmbeddingResponse } from "../types"

type OpenAIEmbeddingResponse = {
	data: Array<{ embedding: number[] | string }>
	usage?: {
		prompt_tokens?: number
		total_tokens?: number
	}
}

export abstract class BaseEmbedder implements Embedder {
	abstract provider: EmbedderProvider
	abstract model: string
	abstract createEmbeddings(texts: string[]): Promise<EmbeddingResponse>
	abstract validateConfiguration(): Promise<{ valid: boolean; error?: string }>

	protected applyQueryPrefixIfNeeded(texts: string[]): string[] {
		const prefix = getModelQueryPrefix(this.provider, this.model)
		if (!prefix) {
			return texts
		}

		return texts.map((text) => {
			if (text.startsWith(prefix)) {
				return text
			}

			const prefixedText = `${prefix}${text}`
			const estimatedTokens = Math.ceil(prefixedText.length / 4)
			if (estimatedTokens > MAX_ITEM_TOKENS) {
				return text
			}

			return prefixedText
		})
	}

	protected chunkByTokenEstimate(texts: string[]): string[][] {
		const chunks: string[][] = []
		let currentChunk: string[] = []
		let currentTokens = 0

		for (const text of texts) {
			const estimatedTokens = Math.ceil(text.length / 4)
			if (estimatedTokens > MAX_ITEM_TOKENS) {
				continue
			}

			if (currentTokens + estimatedTokens > MAX_BATCH_TOKENS && currentChunk.length > 0) {
				chunks.push(currentChunk)
				currentChunk = []
				currentTokens = 0
			}

			currentChunk.push(text)
			currentTokens += estimatedTokens
		}

		if (currentChunk.length > 0) {
			chunks.push(currentChunk)
		}

		return chunks
	}

	protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
		let lastError: unknown
		for (let attempt = 0; attempt < MAX_BATCH_RETRIES; attempt++) {
			try {
				return await fn()
			} catch (error) {
				lastError = error
				if (attempt < MAX_BATCH_RETRIES - 1) {
					const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		throw lastError
	}
}

export function resolveEmbeddingsEndpoint(baseUrl: string): string {
	const normalized = baseUrl.replace(/\/+$/, "")
	if (normalized.endsWith("/embeddings")) {
		return normalized
	}

	return `${normalized}/embeddings`
}

export async function requestOpenAICompatibleEmbeddings(options: {
	endpoint: string
	apiKey: string
	model: string
	input: string[]
	extraHeaders?: Record<string, string>
	extraBody?: Record<string, unknown>
}): Promise<OpenAIEmbeddingResponse> {
	const response = await fetch(options.endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${options.apiKey}`,
			...(options.extraHeaders || {}),
		},
		body: JSON.stringify({
			model: options.model,
			input: options.input,
			...options.extraBody,
		}),
	})

	if (!response.ok) {
		const body = await response.text().catch(() => "")
		throw new Error(`Embedding request failed (${response.status}): ${body || response.statusText}`)
	}

	const data = (await response.json()) as OpenAIEmbeddingResponse
	if (!data?.data || !Array.isArray(data.data)) {
		throw new Error("Embedding provider returned an invalid response structure.")
	}

	return data
}

export function normalizeEmbeddingArray(embedding: number[] | string): number[] {
	if (Array.isArray(embedding)) {
		return embedding
	}

	const buffer = Buffer.from(embedding, "base64")
	const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
	return Array.from(float32Array)
}
