import { BaseEmbedder } from "./base"
import type { EmbeddingResponse } from "../types"

export class OllamaEmbedder extends BaseEmbedder {
	provider = "ollama" as const
	model: string
	private readonly baseUrl: string

	constructor(baseUrl: string, model: string) {
		super()
		this.baseUrl = baseUrl.replace(/\/+$/, "")
		this.model = model
	}

	async createEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
		const processedTexts = this.applyQueryPrefixIfNeeded(texts)
		const chunks = this.chunkByTokenEstimate(processedTexts)
		const embeddings: number[][] = []

		for (const chunk of chunks) {
			const response = await this.withRetry(async () => {
				const result = await fetch(`${this.baseUrl}/api/embed`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model: this.model,
						input: chunk,
					}),
				})

				if (!result.ok) {
					const body = await result.text().catch(() => "")
					throw new Error(`Ollama embedding request failed (${result.status}): ${body || result.statusText}`)
				}

				return result.json() as Promise<{ embeddings: number[][] }>
			})

			if (!Array.isArray(response.embeddings)) {
				throw new Error("Ollama embedding response is invalid.")
			}

			embeddings.push(...response.embeddings)
		}

		return { embeddings }
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
