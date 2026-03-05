import { BedrockRuntimeClient, InvokeModelCommand, type InvokeModelCommandInput } from "@aws-sdk/client-bedrock-runtime"
import { fromIni } from "@aws-sdk/credential-providers"

import { BaseEmbedder } from "./base"
import type { EmbeddingResponse } from "../types"

type BedrockEmbeddingResult = {
	embedding: number[]
	inputTextTokenCount?: number
}

export class BedrockEmbedder extends BaseEmbedder {
	provider = "bedrock" as const
	model: string

	private readonly client: BedrockRuntimeClient

	constructor(region: string, model: string, profile?: string) {
		super()
		this.model = model
		this.client = new BedrockRuntimeClient({
			region,
			...(profile ? { credentials: fromIni({ profile }) } : {}),
		})
	}

	async createEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
		const processedTexts = this.applyQueryPrefixIfNeeded(texts)
		const chunks = this.chunkByTokenEstimate(processedTexts)
		const embeddings: number[][] = []
		let promptTokens = 0

		for (const chunk of chunks) {
			for (const text of chunk) {
				const result = await this.withRetry(() => this.invokeEmbeddingModel(text))
				embeddings.push(result.embedding)
				promptTokens += result.inputTextTokenCount || 0
			}
		}

		return {
			embeddings,
			usage: {
				promptTokens,
				totalTokens: promptTokens,
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

	private async invokeEmbeddingModel(text: string): Promise<BedrockEmbeddingResult> {
		const model = this.model
		let requestBody: Record<string, unknown>

		if (model.startsWith("amazon.nova-2-multimodal")) {
			requestBody = {
				taskType: "SINGLE_EMBEDDING",
				singleEmbeddingParams: {
					embeddingPurpose: "GENERIC_INDEX",
					embeddingDimension: 1024,
					text: {
						truncationMode: "END",
						value: text,
					},
				},
			}
		} else if (model.startsWith("amazon.titan-embed")) {
			requestBody = {
				inputText: text,
			}
		} else if (model.startsWith("cohere.embed")) {
			requestBody = {
				texts: [text],
				input_type: "search_document",
			}
		} else {
			requestBody = {
				inputText: text,
			}
		}

		const params: InvokeModelCommandInput = {
			modelId: model,
			body: JSON.stringify(requestBody),
			contentType: "application/json",
			accept: "application/json",
		}

		const command = new InvokeModelCommand(params)
		const response = await this.client.send(command)
		const payload = JSON.parse(new TextDecoder().decode(response.body)) as any

		if (model.startsWith("amazon.nova-2-multimodal")) {
			return {
				embedding: payload.embeddings?.[0]?.embedding || payload.embedding,
				inputTextTokenCount: payload.inputTextTokenCount,
			}
		}

		if (model.startsWith("cohere.embed")) {
			return {
				embedding: payload.embeddings[0],
			}
		}

		return {
			embedding: payload.embedding,
			inputTextTokenCount: payload.inputTextTokenCount,
		}
	}
}
