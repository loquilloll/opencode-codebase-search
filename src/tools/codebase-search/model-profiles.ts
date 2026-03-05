import type { EmbedderProvider } from "./types"

type ModelProfile = {
	dimension: number
	scoreThreshold: number
	queryPrefix?: string
}

type EmbeddingModelProfiles = Record<EmbedderProvider, Record<string, ModelProfile>>

export const EMBEDDING_MODEL_PROFILES: EmbeddingModelProfiles = {
	openai: {
		"text-embedding-3-small": { dimension: 1536, scoreThreshold: 0.4 },
		"text-embedding-3-large": { dimension: 3072, scoreThreshold: 0.4 },
		"text-embedding-ada-002": { dimension: 1536, scoreThreshold: 0.4 },
	},
	ollama: {
		"nomic-embed-text": { dimension: 768, scoreThreshold: 0.4 },
		"nomic-embed-code": {
			dimension: 3584,
			scoreThreshold: 0.15,
			queryPrefix: "Represent this query for searching relevant code: ",
		},
		"mxbai-embed-large": { dimension: 1024, scoreThreshold: 0.4 },
		"all-minilm": { dimension: 384, scoreThreshold: 0.4 },
	},
	"openai-compatible": {
		"text-embedding-3-small": { dimension: 1536, scoreThreshold: 0.4 },
		"text-embedding-3-large": { dimension: 3072, scoreThreshold: 0.4 },
		"text-embedding-ada-002": { dimension: 1536, scoreThreshold: 0.4 },
		"nomic-embed-code": {
			dimension: 3584,
			scoreThreshold: 0.15,
			queryPrefix: "Represent this query for searching relevant code: ",
		},
	},
	gemini: {
		"gemini-embedding-001": { dimension: 3072, scoreThreshold: 0.4 },
		"text-embedding-004": { dimension: 3072, scoreThreshold: 0.4 },
	},
	mistral: {
		"codestral-embed-2505": { dimension: 1536, scoreThreshold: 0.4 },
	},
	"vercel-ai-gateway": {
		"openai/text-embedding-3-small": { dimension: 1536, scoreThreshold: 0.4 },
		"openai/text-embedding-3-large": { dimension: 3072, scoreThreshold: 0.4 },
		"openai/text-embedding-ada-002": { dimension: 1536, scoreThreshold: 0.4 },
		"cohere/embed-v4.0": { dimension: 1024, scoreThreshold: 0.4 },
		"google/gemini-embedding-001": { dimension: 3072, scoreThreshold: 0.4 },
		"google/text-embedding-005": { dimension: 768, scoreThreshold: 0.4 },
		"google/text-multilingual-embedding-002": { dimension: 768, scoreThreshold: 0.4 },
		"amazon/titan-embed-text-v2": { dimension: 1024, scoreThreshold: 0.4 },
		"mistral/codestral-embed": { dimension: 1536, scoreThreshold: 0.4 },
		"mistral/mistral-embed": { dimension: 1024, scoreThreshold: 0.4 },
	},
	bedrock: {
		"amazon.titan-embed-text-v1": { dimension: 1536, scoreThreshold: 0.4 },
		"amazon.titan-embed-text-v2:0": { dimension: 1024, scoreThreshold: 0.4 },
		"amazon.titan-embed-image-v1": { dimension: 1024, scoreThreshold: 0.4 },
		"amazon.nova-2-multimodal-embeddings-v1:0": { dimension: 1024, scoreThreshold: 0.4 },
		"cohere.embed-english-v3": { dimension: 1024, scoreThreshold: 0.4 },
		"cohere.embed-multilingual-v3": { dimension: 1024, scoreThreshold: 0.4 },
	},
	openrouter: {
		"openai/text-embedding-3-small": { dimension: 1536, scoreThreshold: 0.4 },
		"openai/text-embedding-3-large": { dimension: 3072, scoreThreshold: 0.4 },
		"openai/text-embedding-ada-002": { dimension: 1536, scoreThreshold: 0.4 },
		"google/gemini-embedding-001": { dimension: 3072, scoreThreshold: 0.4 },
		"mistralai/mistral-embed-2312": { dimension: 1024, scoreThreshold: 0.4 },
		"mistralai/codestral-embed-2505": { dimension: 1536, scoreThreshold: 0.4 },
		"qwen/qwen3-embedding-0.6b": { dimension: 1024, scoreThreshold: 0.4 },
		"qwen/qwen3-embedding-4b": { dimension: 2560, scoreThreshold: 0.4 },
		"qwen/qwen3-embedding-8b": { dimension: 4096, scoreThreshold: 0.4 },
	},
}

export function getModelDimension(provider: EmbedderProvider, modelId: string): number | undefined {
	return EMBEDDING_MODEL_PROFILES[provider]?.[modelId]?.dimension
}

export function getModelScoreThreshold(provider: EmbedderProvider, modelId: string): number | undefined {
	return EMBEDDING_MODEL_PROFILES[provider]?.[modelId]?.scoreThreshold
}

export function getModelQueryPrefix(provider: EmbedderProvider, modelId: string): string | undefined {
	return EMBEDDING_MODEL_PROFILES[provider]?.[modelId]?.queryPrefix
}

export function getDefaultModelId(provider: EmbedderProvider): string {
	switch (provider) {
		case "openai":
		case "openai-compatible":
			return "text-embedding-3-small"
		case "ollama":
			return "nomic-embed-text"
		case "gemini":
			return "gemini-embedding-001"
		case "mistral":
			return "codestral-embed-2505"
		case "vercel-ai-gateway":
			return "openai/text-embedding-3-large"
		case "bedrock":
			return "amazon.titan-embed-text-v2:0"
		case "openrouter":
			return "openai/text-embedding-3-large"
		default:
			return "text-embedding-3-small"
	}
}
