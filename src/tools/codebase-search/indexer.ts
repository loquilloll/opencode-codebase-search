import fs from "fs/promises"
import path from "path"
import { v5 as uuidv5 } from "uuid"

import {
	BATCH_SEGMENT_THRESHOLD,
	DEFAULT_IGNORED_DIRS,
	MAX_FILE_SIZE_BYTES,
	QDRANT_CODE_BLOCK_NAMESPACE,
} from "./constants"
import { SUPPORTED_EXTENSIONS } from "./extensions"
import { buildIgnoreMatcher, shouldIgnorePath } from "./ignore"
import { IndexCache } from "./cache"
import { createFileHash, parseTextIntoBlocks } from "./parser"
import { toRelativeWorkspacePath, shouldIgnoreDirectoryName } from "./utils/paths"
import { QdrantIndexStore } from "./qdrant"
import type { Embedder, IndexConfig, IndexingSummary, ParsedBlock } from "./types"

type FileScanResult = {
	relativePath: string
	absolutePath: string
	hash: string
	blocks: ParsedBlock[]
	isNew: boolean
}

async function collectSupportedFiles(worktree: string): Promise<string[]> {
	const matcher = await buildIgnoreMatcher(worktree)
	const files: string[] = []

	const walk = async (absoluteDir: string) => {
		const entries = await fs.readdir(absoluteDir, { withFileTypes: true })
		for (const entry of entries) {
			const absolutePath = path.join(absoluteDir, entry.name)
			const relativePath = toRelativeWorkspacePath(absolutePath, worktree)

			if (entry.isDirectory()) {
				if (shouldIgnoreDirectoryName(entry.name, DEFAULT_IGNORED_DIRS)) {
					continue
				}

				if (shouldIgnorePath(relativePath, matcher)) {
					continue
				}

				await walk(absolutePath)
				continue
			}

			if (!entry.isFile()) {
				continue
			}

			if (shouldIgnorePath(relativePath, matcher)) {
				continue
			}

			const ext = path.extname(absolutePath).toLowerCase()
			if (!SUPPORTED_EXTENSIONS.includes(ext)) {
				continue
			}

			files.push(absolutePath)
		}
	}

	await walk(worktree)
	return files
}

async function collectChanges(
	worktree: string,
	cache: IndexCache,
	absolutePaths: string[],
): Promise<{
	changedFiles: FileScanResult[]
	deletedFiles: string[]
	skippedFiles: number
}> {
	const changedFiles: FileScanResult[] = []
	let skippedFiles = 0

	const known = new Set<string>()

	for (const absolutePath of absolutePaths) {
		const relativePath = toRelativeWorkspacePath(absolutePath, worktree)
		known.add(relativePath)

		try {
			const stats = await fs.stat(absolutePath)
			if (stats.size > MAX_FILE_SIZE_BYTES) {
				skippedFiles++
				continue
			}

			const content = await fs.readFile(absolutePath, "utf8")
			const hash = createFileHash(content)
			const previousHash = cache.getHash(relativePath)

			if (previousHash === hash) {
				skippedFiles++
				continue
			}

			changedFiles.push({
				relativePath,
				absolutePath,
				hash,
				blocks: await parseTextIntoBlocks(absolutePath, content, hash),
				isNew: !previousHash,
			})
		} catch {
			skippedFiles++
		}
	}

	const deletedFiles = Object.keys(cache.getAllHashes()).filter((cachedPath) => !known.has(cachedPath))

	return {
		changedFiles,
		deletedFiles,
		skippedFiles,
	}
}

async function collectAllFilesForReindex(
	worktree: string,
	absolutePaths: string[],
): Promise<{
	changedFiles: FileScanResult[]
	skippedFiles: number
}> {
	const changedFiles: FileScanResult[] = []
	let skippedFiles = 0

	for (const absolutePath of absolutePaths) {
		const relativePath = toRelativeWorkspacePath(absolutePath, worktree)

		try {
			const stats = await fs.stat(absolutePath)
			if (stats.size > MAX_FILE_SIZE_BYTES) {
				skippedFiles++
				continue
			}

			const content = await fs.readFile(absolutePath, "utf8")
			const hash = createFileHash(content)

			changedFiles.push({
				relativePath,
				absolutePath,
				hash,
				blocks: await parseTextIntoBlocks(absolutePath, content, hash),
				isNew: true,
			})
		} catch {
			skippedFiles++
		}
	}

	return {
		changedFiles,
		skippedFiles,
	}
}

export async function ensureIndexFresh(config: IndexConfig, embedder: Embedder): Promise<IndexingSummary> {
	const cache = new IndexCache(config.cacheFilePath)
	await cache.load()

	const vectorSize = config.modelDimension
	if (!vectorSize || vectorSize <= 0) {
		throw new Error(
			`Could not determine embedding dimension for provider=${config.provider}, model=${config.modelId}. Set CODEBASE_SEARCH_MODEL_DIMENSION if using a custom model.`,
		)
	}

	const store = new QdrantIndexStore(config.worktree, config.qdrantUrl, vectorSize, config.qdrantApiKey)
	const initializeResult = await store.initialize(true)

	const absolutePaths = await collectSupportedFiles(config.worktree)
	const hasIndexedData = await store.hasIndexedData()
	const adoptingExistingIndex = !cache.hasExistingFile && hasIndexedData && !initializeResult.created

	let { changedFiles, deletedFiles, skippedFiles } = await collectChanges(config.worktree, cache, absolutePaths)

	const collectionWasRecreated = initializeResult.created && cache.hasExistingFile
	if (collectionWasRecreated) {
		const fullReindex = await collectAllFilesForReindex(config.worktree, absolutePaths)
		changedFiles = fullReindex.changedFiles
		skippedFiles = fullReindex.skippedFiles
	}

	if (changedFiles.length === 0 && deletedFiles.length === 0) {
		return {
			mode: config.indexMode,
			performed: false,
			triggered: false,
			reason: adoptingExistingIndex ? "adopted-existing-roo-index" : "already-fresh",
			processedFiles: 0,
			skippedFiles,
			indexedBlocks: 0,
			deletedFiles: 0,
		}
	}

	await store.markIndexingIncomplete()

	const changedExistingFiles = changedFiles.filter((file) => !file.isNew).map((file) => file.relativePath)
	const deleteTargets = collectionWasRecreated ? [] : [...new Set([...deletedFiles, ...changedExistingFiles])]

	if (deleteTargets.length > 0) {
		await store.deletePointsByMultipleFilePaths(deleteTargets)
	}

	const allBlocks = changedFiles.flatMap((file) => file.blocks)
	let indexedBlocks = 0

	for (let offset = 0; offset < allBlocks.length; offset += BATCH_SEGMENT_THRESHOLD) {
		const batch = allBlocks.slice(offset, offset + BATCH_SEGMENT_THRESHOLD)
		const nonEmptyBlocks = batch.filter((block) => block.content.trim().length > 0)
		const batchTexts = nonEmptyBlocks.map((block) => block.content.trim())

		if (batchTexts.length === 0) {
			continue
		}

		const { embeddings } = await embedder.createEmbeddings(batchTexts)

		const points = nonEmptyBlocks.map((block, index) => ({
			id: uuidv5(block.segmentHash, QDRANT_CODE_BLOCK_NAMESPACE),
			vector: embeddings[index],
			payload: {
				filePath: toRelativeWorkspacePath(block.filePath, config.worktree),
				codeChunk: block.content,
				startLine: block.startLine,
				endLine: block.endLine,
				segmentHash: block.segmentHash,
			},
		}))

		await store.upsertPoints(points)
		indexedBlocks += points.length
	}

	for (const file of changedFiles) {
		cache.setHash(file.relativePath, file.hash)
	}

	for (const deletedPath of deletedFiles) {
		cache.deleteHash(deletedPath)
	}

	await cache.save()
	await store.markIndexingComplete()

	return {
		mode: config.indexMode,
		performed: true,
		triggered: true,
		reason: adoptingExistingIndex ? "adopted-existing-roo-index-reconciled" : "incremental-index-applied",
		processedFiles: changedFiles.length,
		skippedFiles,
		indexedBlocks,
		deletedFiles: deletedFiles.length,
	}
}

export async function canSearchExistingIndex(config: IndexConfig): Promise<boolean> {
	const vectorSize = config.modelDimension
	if (!vectorSize || vectorSize <= 0) {
		return false
	}

	const store = new QdrantIndexStore(config.worktree, config.qdrantUrl, vectorSize, config.qdrantApiKey)
	const initialized = await store.initialize(false)
	if (!initialized.exists) {
		return false
	}

	return store.hasIndexedData()
}

export async function searchIndex(config: IndexConfig, embedder: Embedder, query: string, searchPath?: string | null) {
	const vectorSize = config.modelDimension
	if (!vectorSize || vectorSize <= 0) {
		throw new Error(
			`Could not determine embedding dimension for provider=${config.provider}, model=${config.modelId}. Set CODEBASE_SEARCH_MODEL_DIMENSION if using a custom model.`,
		)
	}

	const store = new QdrantIndexStore(config.worktree, config.qdrantUrl, vectorSize, config.qdrantApiKey)
	const initialized = await store.initialize(false)
	if (!initialized.exists) {
		return []
	}

	const embeddingResponse = await embedder.createEmbeddings([query])
	const queryVector = embeddingResponse.embeddings[0]
	if (!queryVector) {
		throw new Error("Failed to generate embedding for query.")
	}

	const results = await store.search(queryVector, searchPath, config.searchMinScore, config.searchMaxResults)
	return results
}
