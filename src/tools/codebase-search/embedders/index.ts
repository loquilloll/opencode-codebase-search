import { getDefaultModelId } from "../model-profiles"
import type { Embedder, IndexConfig } from "../types"

import { BedrockEmbedder } from "./bedrock"
import { OllamaEmbedder } from "./ollama"
import { OpenAIFamilyEmbedder } from "./openai-family"

export function createEmbedder(config: IndexConfig): Embedder {
	const model = config.modelId || getDefaultModelId(config.provider)

	switch (config.provider) {
		case "openai": {
			if (!config.openAiApiKey) {
				throw new Error("Missing OpenAI API key. Set CODEBASE_SEARCH_OPENAI_API_KEY.")
			}

			return new OpenAIFamilyEmbedder({
				provider: "openai",
				apiKey: config.openAiApiKey,
				baseUrl: config.openAiBaseUrl || "https://api.openai.com/v1",
				model,
			})
		}
		case "ollama": {
			return new OllamaEmbedder(config.ollamaBaseUrl || "http://localhost:11434", model)
		}
		case "openai-compatible": {
			if (!config.openAiCompatibleBaseUrl || !config.openAiCompatibleApiKey) {
				throw new Error(
					"Missing OpenAI-compatible settings. Set CODEBASE_SEARCH_OPENAI_COMPAT_BASE_URL and CODEBASE_SEARCH_OPENAI_COMPAT_API_KEY.",
				)
			}

			return new OpenAIFamilyEmbedder({
				provider: "openai-compatible",
				apiKey: config.openAiCompatibleApiKey,
				baseUrl: config.openAiCompatibleBaseUrl,
				model,
			})
		}
		case "gemini": {
			if (!config.geminiApiKey) {
				throw new Error("Missing Gemini API key. Set CODEBASE_SEARCH_GEMINI_API_KEY.")
			}

			const normalizedModel = model === "text-embedding-004" ? "gemini-embedding-001" : model

			return new OpenAIFamilyEmbedder({
				provider: "gemini",
				apiKey: config.geminiApiKey,
				baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
				model: normalizedModel,
			})
		}
		case "mistral": {
			if (!config.mistralApiKey) {
				throw new Error("Missing Mistral API key. Set CODEBASE_SEARCH_MISTRAL_API_KEY.")
			}

			return new OpenAIFamilyEmbedder({
				provider: "mistral",
				apiKey: config.mistralApiKey,
				baseUrl: "https://api.mistral.ai/v1",
				model,
			})
		}
		case "vercel-ai-gateway": {
			if (!config.vercelAiGatewayApiKey) {
				throw new Error("Missing Vercel AI Gateway API key. Set CODEBASE_SEARCH_VERCEL_AI_GATEWAY_API_KEY.")
			}

			return new OpenAIFamilyEmbedder({
				provider: "vercel-ai-gateway",
				apiKey: config.vercelAiGatewayApiKey,
				baseUrl: "https://ai-gateway.vercel.sh/v1",
				model,
			})
		}
		case "bedrock": {
			if (!config.bedrockRegion) {
				throw new Error("Missing Bedrock region. Set CODEBASE_SEARCH_BEDROCK_REGION.")
			}

			return new BedrockEmbedder(config.bedrockRegion, model, config.bedrockProfile)
		}
		case "openrouter": {
			if (!config.openRouterApiKey) {
				throw new Error("Missing OpenRouter API key. Set CODEBASE_SEARCH_OPENROUTER_API_KEY.")
			}

			return new OpenAIFamilyEmbedder({
				provider: "openrouter",
				apiKey: config.openRouterApiKey,
				baseUrl: "https://openrouter.ai/api/v1",
				model,
				specificProvider: config.openRouterSpecificProvider,
				extraHeaders: {
					"HTTP-Referer": "https://github.com/RooCodeInc/Roo-Code",
					"X-Title": "Roo Code",
				},
			})
		}
		default:
			throw new Error(`Unsupported embedder provider: ${config.provider}`)
	}
}
