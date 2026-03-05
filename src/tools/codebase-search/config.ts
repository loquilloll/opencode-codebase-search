import fs from "fs"
import os from "os"
import path from "path"
import { execSync } from "child_process"
import { parse as parseJsonc } from "jsonc-parser"

import {
	DEFAULT_FOLLOW_EXTERNAL_SYMLINKS,
	DEFAULT_FOLLOW_SYMLINKS,
	DEFAULT_INDEX_MODE,
	DEFAULT_MAX_SEARCH_RESULTS,
	DEFAULT_QDRANT_URL,
	DEFAULT_SEARCH_MIN_SCORE,
} from "./constants"
import { getDefaultModelId, getModelDimension, getModelScoreThreshold } from "./model-profiles"
import { collectionNameForWorktree } from "./utils/hash"
import type { EmbedderProvider, IndexConfig, IndexMode } from "./types"

const VALID_MODES: IndexMode[] = ["disabled", "query", "background"]
const VALID_PROVIDERS: EmbedderProvider[] = [
	"openai",
	"ollama",
	"openai-compatible",
	"gemini",
	"mistral",
	"vercel-ai-gateway",
	"bedrock",
	"openrouter",
]

type SettingsFile = Partial<
	Pick<
		IndexConfig,
		| "indexMode"
		| "followSymlinks"
		| "followExternalSymlinks"
		| "provider"
		| "modelId"
		| "modelDimension"
		| "qdrantUrl"
		| "qdrantApiKey"
		| "searchMinScore"
		| "searchMaxResults"
		| "openAiApiKey"
		| "openAiBaseUrl"
		| "ollamaBaseUrl"
		| "openAiCompatibleBaseUrl"
		| "openAiCompatibleApiKey"
		| "geminiApiKey"
		| "mistralApiKey"
		| "vercelAiGatewayApiKey"
		| "bedrockRegion"
		| "bedrockProfile"
		| "openRouterApiKey"
		| "openRouterSpecificProvider"
	>
>

function parseNumber(value: string | undefined): number | undefined {
	if (!value) {
		return undefined
	}

	const parsed = Number(value)
	if (Number.isNaN(parsed)) {
		return undefined
	}

	return parsed
}

function parseBoolean(value?: string): boolean | undefined {
	if (!value) {
		return undefined
	}

	const normalized = value.trim().toLowerCase()
	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true
	}

	if (["0", "false", "no", "off"].includes(normalized)) {
		return false
	}

	return undefined
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") {
		return value
	}

	if (typeof value === "string") {
		return parseBoolean(value)
	}

	return undefined
}

function parseOptionalMode(value?: string): IndexMode | undefined {
	if (!value) {
		return undefined
	}

	if (VALID_MODES.includes(value as IndexMode)) {
		return value as IndexMode
	}

	return undefined
}

function parseOptionalProvider(value?: string): EmbedderProvider | undefined {
	if (!value) {
		return undefined
	}

	if (VALID_PROVIDERS.includes(value as EmbedderProvider)) {
		return value as EmbedderProvider
	}

	return undefined
}

function resolveCommandSubstitution(raw: string, worktree: string, key: string): string {
	const trimmed = raw.trim()
	const match = /^\$\(([\s\S]+)\)$/.exec(trimmed)
	if (!match) {
		return raw
	}

	const command = match[1].trim()
	if (!command) {
		return ""
	}

	try {
		const output = execSync(command, {
			cwd: worktree,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 15000,
			maxBuffer: 1024 * 1024,
			env: {
				...process.env,
				CI: "true",
			},
		})

		return output.trim()
	} catch (error: any) {
		const stderr =
			typeof error?.stderr === "string"
				? error.stderr
				: Buffer.isBuffer(error?.stderr)
					? error.stderr.toString("utf8")
					: ""
		const message = (stderr || error?.message || "command substitution failed").trim()
		throw new Error(`Failed to resolve ${key} from command substitution '${command}': ${message}`)
	}
}

function resolveOptionalString(
	value: unknown,
	worktree: string,
	key: string,
	options?: { trim?: boolean },
): string | undefined {
	if (typeof value !== "string") {
		return undefined
	}

	const resolved = resolveCommandSubstitution(value, worktree, key)
	if (options?.trim === false) {
		return resolved
	}

	return resolved.trim()
}

function settingsFilePath(worktree: string): string {
	const overridePath = process.env.CODEBASE_SEARCH_SETTINGS_FILE
	if (overridePath && overridePath.trim() !== "") {
		return path.isAbsolute(overridePath) ? overridePath : path.join(worktree, overridePath)
	}

	const worktreeSettingsPath = path.join(worktree, ".opencode", "codebase-search.settings.jsonc")
	if (fs.existsSync(worktreeSettingsPath)) {
		return worktreeSettingsPath
	}

	const globalSettingsPath = path.join(os.homedir(), ".config", "opencode", "codebase-search.settings.jsonc")
	if (fs.existsSync(globalSettingsPath)) {
		return globalSettingsPath
	}

	return worktreeSettingsPath
}

function loadSettingsFromJsonc(worktree: string): SettingsFile {
	const filePath = settingsFilePath(worktree)
	if (!fs.existsSync(filePath)) {
		return {}
	}

	const raw = fs.readFileSync(filePath, "utf8")
	const parseErrors: Array<{ error: number; offset: number; length: number }> = []
	const parsed = parseJsonc(raw, parseErrors, {
		allowTrailingComma: true,
		disallowComments: false,
	})

	if (parseErrors.length > 0) {
		const firstError = parseErrors[0]
		throw new Error(
			`Invalid JSONC in ${path.relative(worktree, filePath)} at offset ${firstError.offset}. Fix the file or remove comments/trailing commas around the reported location.`,
		)
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error(`Settings file ${path.relative(worktree, filePath)} must contain a JSON object.`)
	}

	const settings = parsed as Record<string, unknown>
	const indexMode = parseOptionalMode(typeof settings.indexMode === "string" ? settings.indexMode : undefined)
	const provider = parseOptionalProvider(typeof settings.provider === "string" ? settings.provider : undefined)

	return {
		indexMode,
		followSymlinks: parseOptionalBoolean(settings.followSymlinks),
		followExternalSymlinks: parseOptionalBoolean(settings.followExternalSymlinks),
		provider,
		modelId: resolveOptionalString(settings.modelId, worktree, "modelId"),
		modelDimension: typeof settings.modelDimension === "number" ? settings.modelDimension : undefined,
		qdrantUrl: resolveOptionalString(settings.qdrantUrl, worktree, "qdrantUrl", { trim: false }),
		qdrantApiKey: resolveOptionalString(settings.qdrantApiKey, worktree, "qdrantApiKey"),
		searchMinScore: typeof settings.searchMinScore === "number" ? settings.searchMinScore : undefined,
		searchMaxResults: typeof settings.searchMaxResults === "number" ? settings.searchMaxResults : undefined,
		openAiApiKey: resolveOptionalString(settings.openAiApiKey, worktree, "openAiApiKey"),
		openAiBaseUrl: resolveOptionalString(settings.openAiBaseUrl, worktree, "openAiBaseUrl", { trim: false }),
		ollamaBaseUrl: resolveOptionalString(settings.ollamaBaseUrl, worktree, "ollamaBaseUrl", { trim: false }),
		openAiCompatibleBaseUrl: resolveOptionalString(
			settings.openAiCompatibleBaseUrl,
			worktree,
			"openAiCompatibleBaseUrl",
			{ trim: false },
		),
		openAiCompatibleApiKey: resolveOptionalString(
			settings.openAiCompatibleApiKey,
			worktree,
			"openAiCompatibleApiKey",
		),
		geminiApiKey: resolveOptionalString(settings.geminiApiKey, worktree, "geminiApiKey"),
		mistralApiKey: resolveOptionalString(settings.mistralApiKey, worktree, "mistralApiKey"),
		vercelAiGatewayApiKey: resolveOptionalString(settings.vercelAiGatewayApiKey, worktree, "vercelAiGatewayApiKey"),
		bedrockRegion: resolveOptionalString(settings.bedrockRegion, worktree, "bedrockRegion"),
		bedrockProfile: resolveOptionalString(settings.bedrockProfile, worktree, "bedrockProfile"),
		openRouterApiKey: resolveOptionalString(settings.openRouterApiKey, worktree, "openRouterApiKey"),
		openRouterSpecificProvider: resolveOptionalString(
			settings.openRouterSpecificProvider,
			worktree,
			"openRouterSpecificProvider",
		),
	}
}

export function resolveIndexMode(modeOverride: IndexMode | undefined, fileMode?: IndexMode): IndexMode {
	if (modeOverride && VALID_MODES.includes(modeOverride)) {
		return modeOverride
	}

	const envMode = process.env.CODEBASE_SEARCH_INDEX_MODE as IndexMode | undefined
	if (envMode && VALID_MODES.includes(envMode)) {
		return envMode
	}

	if (fileMode && VALID_MODES.includes(fileMode)) {
		return fileMode
	}

	return DEFAULT_INDEX_MODE as IndexMode
}

function resolveProvider(fileProvider?: EmbedderProvider): EmbedderProvider {
	const envProvider = process.env.CODEBASE_SEARCH_PROVIDER as EmbedderProvider | undefined
	if (envProvider && VALID_PROVIDERS.includes(envProvider)) {
		return envProvider
	}

	if (fileProvider && VALID_PROVIDERS.includes(fileProvider)) {
		return fileProvider
	}

	return "openai"
}

export function getCollectionName(worktree: string): string {
	return collectionNameForWorktree(worktree)
}

export function getSettingsPath(worktree: string): string {
	return settingsFilePath(worktree)
}

export function loadIndexConfig(worktree: string, modeOverride?: IndexMode): IndexConfig {
	const settings = loadSettingsFromJsonc(worktree)

	const provider = resolveProvider(settings.provider)
	const modelId = process.env.CODEBASE_SEARCH_MODEL_ID || settings.modelId || getDefaultModelId(provider)
	const modelDimension =
		parseNumber(process.env.CODEBASE_SEARCH_MODEL_DIMENSION) ||
		settings.modelDimension ||
		getModelDimension(provider, modelId)

	const defaultThreshold = getModelScoreThreshold(provider, modelId) ?? DEFAULT_SEARCH_MIN_SCORE
	const searchMinScore =
		parseNumber(process.env.CODEBASE_SEARCH_SEARCH_MIN_SCORE) ?? settings.searchMinScore ?? defaultThreshold
	const searchMaxResults =
		parseNumber(process.env.CODEBASE_SEARCH_SEARCH_MAX_RESULTS) ??
		settings.searchMaxResults ??
		DEFAULT_MAX_SEARCH_RESULTS
	const followSymlinks =
		parseBoolean(process.env.CODEBASE_SEARCH_FOLLOW_SYMLINKS) ??
		settings.followSymlinks ??
		DEFAULT_FOLLOW_SYMLINKS
	const followExternalSymlinks =
		parseBoolean(process.env.CODEBASE_SEARCH_FOLLOW_EXTERNAL_SYMLINKS) ??
		settings.followExternalSymlinks ??
		DEFAULT_FOLLOW_EXTERNAL_SYMLINKS

	const cacheRoot = path.join(worktree, ".opencode", "codebase-search")
	const cacheFilePath = path.join(cacheRoot, `${getCollectionName(worktree)}.cache.json`)

	return {
		worktree,
		indexMode: resolveIndexMode(modeOverride, settings.indexMode),
		followSymlinks,
		followExternalSymlinks,
		provider,
		modelId,
		modelDimension,
		qdrantUrl: process.env.CODEBASE_SEARCH_QDRANT_URL || settings.qdrantUrl || DEFAULT_QDRANT_URL,
		qdrantApiKey: process.env.CODEBASE_SEARCH_QDRANT_API_KEY || settings.qdrantApiKey,
		searchMinScore,
		searchMaxResults,
		openAiApiKey: process.env.CODEBASE_SEARCH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || settings.openAiApiKey,
		openAiBaseUrl: process.env.CODEBASE_SEARCH_OPENAI_BASE_URL || settings.openAiBaseUrl,
		ollamaBaseUrl:
			process.env.CODEBASE_SEARCH_OLLAMA_BASE_URL || settings.ollamaBaseUrl || "http://localhost:11434",
		openAiCompatibleBaseUrl: process.env.CODEBASE_SEARCH_OPENAI_COMPAT_BASE_URL || settings.openAiCompatibleBaseUrl,
		openAiCompatibleApiKey: process.env.CODEBASE_SEARCH_OPENAI_COMPAT_API_KEY || settings.openAiCompatibleApiKey,
		geminiApiKey: process.env.CODEBASE_SEARCH_GEMINI_API_KEY || settings.geminiApiKey,
		mistralApiKey: process.env.CODEBASE_SEARCH_MISTRAL_API_KEY || settings.mistralApiKey,
		vercelAiGatewayApiKey: process.env.CODEBASE_SEARCH_VERCEL_AI_GATEWAY_API_KEY || settings.vercelAiGatewayApiKey,
		bedrockRegion: process.env.CODEBASE_SEARCH_BEDROCK_REGION || settings.bedrockRegion,
		bedrockProfile: process.env.CODEBASE_SEARCH_BEDROCK_PROFILE || settings.bedrockProfile,
		openRouterApiKey: process.env.CODEBASE_SEARCH_OPENROUTER_API_KEY || settings.openRouterApiKey,
		openRouterSpecificProvider:
			process.env.CODEBASE_SEARCH_OPENROUTER_PROVIDER || settings.openRouterSpecificProvider,
		cacheFilePath,
	}
}

export function validateProviderConfig(config: IndexConfig): void {
	switch (config.provider) {
		case "openai":
			if (!config.openAiApiKey) {
				throw new Error(
					"Missing OpenAI API key. Set CODEBASE_SEARCH_OPENAI_API_KEY or configure openAiApiKey in .opencode/codebase-search.settings.jsonc.",
				)
			}
			return
		case "ollama":
			if (!config.ollamaBaseUrl) {
				throw new Error(
					"Missing Ollama base URL. Set CODEBASE_SEARCH_OLLAMA_BASE_URL or configure ollamaBaseUrl in .opencode/codebase-search.settings.jsonc.",
				)
			}
			return
		case "openai-compatible":
			if (!config.openAiCompatibleBaseUrl || !config.openAiCompatibleApiKey) {
				throw new Error(
					"Missing OpenAI-compatible settings. Set CODEBASE_SEARCH_OPENAI_COMPAT_BASE_URL/CODEBASE_SEARCH_OPENAI_COMPAT_API_KEY or configure openAiCompatibleBaseUrl/openAiCompatibleApiKey in .opencode/codebase-search.settings.jsonc.",
				)
			}
			return
		case "gemini":
			if (!config.geminiApiKey) {
				throw new Error(
					"Missing Gemini API key. Set CODEBASE_SEARCH_GEMINI_API_KEY or configure geminiApiKey in .opencode/codebase-search.settings.jsonc.",
				)
			}
			return
		case "mistral":
			if (!config.mistralApiKey) {
				throw new Error(
					"Missing Mistral API key. Set CODEBASE_SEARCH_MISTRAL_API_KEY or configure mistralApiKey in .opencode/codebase-search.settings.jsonc.",
				)
			}
			return
		case "vercel-ai-gateway":
			if (!config.vercelAiGatewayApiKey) {
				throw new Error(
					"Missing Vercel AI Gateway API key. Set CODEBASE_SEARCH_VERCEL_AI_GATEWAY_API_KEY or configure vercelAiGatewayApiKey in .opencode/codebase-search.settings.jsonc.",
				)
			}
			return
		case "bedrock":
			if (!config.bedrockRegion) {
				throw new Error(
					"Missing Bedrock region. Set CODEBASE_SEARCH_BEDROCK_REGION or configure bedrockRegion in .opencode/codebase-search.settings.jsonc.",
				)
			}
			return
		case "openrouter":
			if (!config.openRouterApiKey) {
				throw new Error(
					"Missing OpenRouter API key. Set CODEBASE_SEARCH_OPENROUTER_API_KEY or configure openRouterApiKey in .opencode/codebase-search.settings.jsonc.",
				)
			}
			return
		default:
			throw new Error(`Unsupported embedder provider: ${config.provider}`)
	}
}
