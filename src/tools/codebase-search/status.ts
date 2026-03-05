import fs from "fs/promises"

import { BATCH_SEGMENT_THRESHOLD, MAX_FILE_SIZE_BYTES } from "./constants"
import { getLegacyCacheFilePath, getSettingsPath, loadIndexConfig } from "./config"
import { createFileHash, parseTextIntoBlocks } from "./parser"
import { QdrantIndexStore } from "./qdrant"
import { scanSupportedFiles } from "./scanner"
import { toRelativeWorkspacePath } from "./utils/paths"
import type { DiffStatus, IndexStatus, ModeAssessment, QdrantStatus, StatusOptions } from "./types"

const DEFAULT_STATUS_TIMEOUT_MS = 10_000
const BACKGROUND_RECENT_THRESHOLD_MS = 5 * 60 * 1000
const BACKGROUND_STALE_THRESHOLD_MS = 60 * 60 * 1000

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}

	return String(error)
}

function normalizeQdrantUrl(url: string): string {
	if (!url || url.trim() === "") {
		return "http://localhost:6333"
	}

	const trimmed = url.trim()
	if (!trimmed.includes("://")) {
		return `http://${trimmed}`
	}

	return trimmed
}

async function assertQdrantReachable(qdrantUrl: string): Promise<void> {
	const normalizedUrl = normalizeQdrantUrl(qdrantUrl).replace(/\/+$/, "")
	const response = await fetch(`${normalizedUrl}/collections`, { method: "GET" })
	if (!response.ok) {
		throw new Error(`Qdrant probe failed with HTTP ${response.status}`)
	}
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
	let timeoutId: NodeJS.Timeout | undefined
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`${operation} timed out after ${timeoutMs}ms`))
		}, timeoutMs)
	})

	try {
		return await Promise.race([promise, timeoutPromise])
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId)
		}
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

async function readCacheRecord(cacheFilePath: string): Promise<{ exists: boolean; hashes: Record<string, string> }> {
	if (!(await fileExists(cacheFilePath))) {
		return {
			exists: false,
			hashes: {},
		}
	}

	try {
		const content = await fs.readFile(cacheFilePath, "utf8")
		const parsed = JSON.parse(content)
		if (!parsed || typeof parsed !== "object") {
			return {
				exists: true,
				hashes: {},
			}
		}

		const hashes = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
			if (typeof value === "string") {
				acc[key] = value
			}
			return acc
		}, {})

		return {
			exists: true,
			hashes,
		}
	} catch {
		return {
			exists: true,
			hashes: {},
		}
	}
}

async function probeQdrantStatus(
	worktree: string,
	qdrantUrl: string,
	vectorSize: number,
	qdrantApiKey: string | undefined,
	timeoutMs: number,
): Promise<QdrantStatus> {
	const store = new QdrantIndexStore(worktree, qdrantUrl, vectorSize, qdrantApiKey)

	const baseStatus: QdrantStatus = {
		reachable: false,
		url: qdrantUrl,
		collectionName: store.getCollectionName(),
		collectionExists: false,
		pointsCount: 0,
		indexingComplete: null,
		lastCompletedAt: null,
	}

	try {
		await withTimeout(assertQdrantReachable(qdrantUrl), timeoutMs, "Qdrant reachability probe")

		const collectionInfo = await withTimeout(store.getCollectionInfo(), timeoutMs, "Qdrant collection probe")
		if (!collectionInfo) {
			return {
				...baseStatus,
				reachable: true,
			}
		}

		const pointsCount = typeof collectionInfo.points_count === "number" ? collectionInfo.points_count : 0
		const hasIndexedData = await withTimeout(store.hasIndexedData(), timeoutMs, "Qdrant indexed data probe")
		const metadata = await withTimeout(store.getMetadata(), timeoutMs, "Qdrant metadata probe")

		const indexingComplete =
			typeof metadata?.indexing_complete === "boolean" ? metadata.indexing_complete : hasIndexedData ? true : null
		const lastCompletedAt = typeof metadata?.completed_at === "number" ? metadata.completed_at : null

		return {
			...baseStatus,
			reachable: true,
			collectionExists: true,
			pointsCount,
			indexingComplete,
			lastCompletedAt,
		}
	} catch (error) {
		return {
			...baseStatus,
			error: toErrorMessage(error),
		}
	}
}

async function collectDiffStatus(
	worktree: string,
	cacheHashes: Record<string, string>,
	scannedFiles: Array<{ logicalAbsolutePath: string; resolvedAbsolutePath: string }>,
): Promise<DiffStatus> {
	const startedAt = Date.now()
	const knownPaths = new Set<string>()

	let changedFiles = 0
	let newFiles = 0
	let skippedFiles = 0
	let estimatedBlocks = 0

	for (const scannedFile of scannedFiles) {
		const relativePath = toRelativeWorkspacePath(scannedFile.logicalAbsolutePath, worktree)
		knownPaths.add(relativePath)

		try {
			const stats = await fs.stat(scannedFile.resolvedAbsolutePath)
			if (stats.size > MAX_FILE_SIZE_BYTES) {
				skippedFiles++
				continue
			}

			const content = await fs.readFile(scannedFile.resolvedAbsolutePath, "utf8")
			const hash = createFileHash(content)
			const previousHash = cacheHashes[relativePath]

			if (previousHash === hash) {
				continue
			}

			if (previousHash) {
				changedFiles++
			} else {
				newFiles++
			}

			const blocks = await parseTextIntoBlocks(scannedFile.logicalAbsolutePath, content, hash, {
				parsePath: scannedFile.resolvedAbsolutePath,
			})
			estimatedBlocks += blocks.length
		} catch {
			skippedFiles++
		}
	}

	const deletedFiles = Object.keys(cacheHashes).filter((cachedPath) => !knownPaths.has(cachedPath)).length

	return {
		changedFiles,
		newFiles,
		deletedFiles,
		skippedFiles,
		estimatedBlocks,
		estimatedBatches: estimatedBlocks === 0 ? 0 : Math.ceil(estimatedBlocks / BATCH_SEGMENT_THRESHOLD),
		diffDurationMs: Date.now() - startedAt,
	}
}

function formatBackgroundAge(lastCompletedAt: number | null): string {
	if (!lastCompletedAt) {
		return "never"
	}

	const ageMs = Date.now() - lastCompletedAt
	const ageMinutes = Math.max(0, Math.floor(ageMs / 60000))
	return `${ageMinutes}m ago`
}

function buildModeAssessments(qdrantStatus: QdrantStatus, diff: DiffStatus | null): ModeAssessment[] {
	const assessments: ModeAssessment[] = []

	if (!qdrantStatus.reachable) {
		assessments.push({
			mode: "disabled",
			severity: "problem",
			explanation: `Qdrant unreachable (${qdrantStatus.error || "unknown error"}); disabled mode cannot search existing index.`,
		})
	} else if (!qdrantStatus.collectionExists || qdrantStatus.pointsCount <= 0 || qdrantStatus.indexingComplete === false) {
		assessments.push({
			mode: "disabled",
			severity: "problem",
			explanation: "No complete indexed collection found; disabled mode will return empty results.",
		})
	} else {
		assessments.push({
			mode: "disabled",
			severity: "ok",
			explanation: `Collection has indexed data (${qdrantStatus.pointsCount} points); disabled mode can search immediately.`,
		})
	}

	if (!diff) {
		assessments.push({
			mode: "query",
			severity: "warning",
			explanation: "Dry-run diff skipped; query-mode reconciliation cost is unknown.",
		})
	} else {
		const pendingFiles = diff.changedFiles + diff.newFiles + diff.deletedFiles
		if (pendingFiles === 0) {
			assessments.push({
				mode: "query",
				severity: "ok",
				explanation: "No pending reconciliation work; query mode should stay fast.",
			})
		} else if (pendingFiles < 50) {
			assessments.push({
				mode: "query",
				severity: "warning",
				explanation: `${pendingFiles} files pending reconciliation (~${diff.estimatedBatches} embedding batches).`,
			})
		} else {
			assessments.push({
				mode: "query",
				severity: "problem",
				explanation: `${pendingFiles} files pending reconciliation (~${diff.estimatedBlocks} blocks, ~${diff.estimatedBatches} embedding batches).`,
			})
		}
	}

	if (!qdrantStatus.reachable) {
		assessments.push({
			mode: "background",
			severity: "problem",
			explanation: `Qdrant unreachable (${qdrantStatus.error || "unknown error"}); background health cannot be verified.`,
		})
	} else if (!qdrantStatus.lastCompletedAt) {
		assessments.push({
			mode: "background",
			severity: "problem",
			explanation: "No completed indexing timestamp found; background status is unknown.",
		})
	} else if (!diff) {
		assessments.push({
			mode: "background",
			severity: "warning",
			explanation: `Last completed ${formatBackgroundAge(qdrantStatus.lastCompletedAt)}; pending workload unknown because diff was skipped.`,
		})
	} else {
		const pendingFiles = diff.changedFiles + diff.newFiles + diff.deletedFiles
		const ageMs = Date.now() - qdrantStatus.lastCompletedAt

		if (pendingFiles === 0 && ageMs <= BACKGROUND_RECENT_THRESHOLD_MS) {
			assessments.push({
				mode: "background",
				severity: "ok",
				explanation: `Background appears caught up (last completed ${formatBackgroundAge(qdrantStatus.lastCompletedAt)}).`,
			})
		} else if (pendingFiles > 0 && ageMs >= BACKGROUND_STALE_THRESHOLD_MS) {
			assessments.push({
				mode: "background",
				severity: "problem",
				explanation: `Background appears stale (${pendingFiles} files pending, last completed ${formatBackgroundAge(qdrantStatus.lastCompletedAt)}).`,
			})
		} else {
			assessments.push({
				mode: "background",
				severity: "warning",
				explanation: `${pendingFiles} files pending; last completed ${formatBackgroundAge(qdrantStatus.lastCompletedAt)}.`,
			})
		}
	}

	return assessments
}

export async function collectIndexStatus(worktree: string, options: StatusOptions = {}): Promise<IndexStatus> {
	const config = loadIndexConfig(worktree)
	const timeoutMs = options.timeoutMs ?? DEFAULT_STATUS_TIMEOUT_MS

	const qdrantStatusPromise = probeQdrantStatus(
		worktree,
		config.qdrantUrl,
		config.modelDimension && config.modelDimension > 0 ? config.modelDimension : 1,
		config.qdrantApiKey,
		timeoutMs,
	)

	const cacheFilePath = config.cacheFilePath
	const legacyCacheFilePath = getLegacyCacheFilePath(worktree)
	const cacheRecordPromise = readCacheRecord(cacheFilePath)
	const legacyExistsPromise = fileExists(legacyCacheFilePath)

	const scanStartedAt = Date.now()
	const scannedFiles = await scanSupportedFiles(worktree, {
		followSymlinks: config.followSymlinks,
		followExternalSymlinks: config.followExternalSymlinks,
	})
	const scanDurationMs = Date.now() - scanStartedAt

	const [qdrantStatus, cacheRecord, legacyExists] = await Promise.all([
		qdrantStatusPromise,
		cacheRecordPromise,
		legacyExistsPromise,
	])

	const diff = options.skipDiff ? null : await collectDiffStatus(worktree, cacheRecord.hashes, scannedFiles)
	const assessments = buildModeAssessments(qdrantStatus, diff)

	return {
		timestamp: new Date().toISOString(),
		config: {
			settingsFilePath: getSettingsPath(worktree),
			provider: config.provider,
			modelId: config.modelId,
			modelDimension: config.modelDimension,
			indexMode: config.indexMode,
			qdrantUrl: config.qdrantUrl,
			followSymlinks: config.followSymlinks,
			followExternalSymlinks: config.followExternalSymlinks,
		},
		qdrant: qdrantStatus,
		cache: {
			filePath: cacheFilePath,
			exists: cacheRecord.exists,
			entryCount: Object.keys(cacheRecord.hashes).length,
			legacyFilePath: legacyCacheFilePath,
			legacyExists,
		},
		worktree: {
			worktree,
			indexableFileCount: scannedFiles.length,
			scanDurationMs,
		},
		diff,
		assessments,
	}
}
