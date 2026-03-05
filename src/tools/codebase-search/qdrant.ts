import path from "path"
import { QdrantClient } from "@qdrant/js-client-rest"
import { v5 as uuidv5 } from "uuid"

import { DEFAULT_MAX_SEARCH_RESULTS, DEFAULT_SEARCH_MIN_SCORE, QDRANT_CODE_BLOCK_NAMESPACE } from "./constants"
import { collectionNameForWorktree } from "./utils/hash"
import { normalizeDirectoryPrefix } from "./utils/paths"
import type { IndexPoint, QueryResult } from "./types"

type CollectionMetadata = {
	indexing_complete?: boolean
	started_at?: number
	completed_at?: number
}

export class QdrantIndexStore {
	private readonly client: QdrantClient
	private readonly collectionName: string

	constructor(
		private readonly worktree: string,
		private readonly qdrantUrl: string,
		private readonly vectorSize: number,
		private readonly apiKey?: string,
	) {
		const normalizedUrl = this.parseQdrantUrl(qdrantUrl)
		this.collectionName = collectionNameForWorktree(worktree)

		try {
			const urlObj = new URL(normalizedUrl)
			const hasPort = Boolean(urlObj.port)
			const useHttps = urlObj.protocol === "https:"
			const port = hasPort ? Number(urlObj.port) : useHttps ? 443 : 80

			this.client = new QdrantClient({
				host: urlObj.hostname,
				https: useHttps,
				port,
				prefix: urlObj.pathname === "/" ? undefined : urlObj.pathname.replace(/\/+$/, ""),
				apiKey,
				headers: {
					"User-Agent": "Roo-Codebase-Search-Tool",
				},
			})
		} catch {
			this.client = new QdrantClient({
				url: normalizedUrl,
				apiKey,
				headers: {
					"User-Agent": "Roo-Codebase-Search-Tool",
				},
			})
		}
	}

	getCollectionName(): string {
		return this.collectionName
	}

	private parseQdrantUrl(url: string): string {
		if (!url || url.trim() === "") {
			return "http://localhost:6333"
		}

		const trimmed = url.trim()
		if (!trimmed.includes("://")) {
			if (trimmed.includes(":")) {
				return `http://${trimmed}`
			}
			return `http://${trimmed}`
		}

		return trimmed
	}

	private async getCollectionInfo(): Promise<any | null> {
		try {
			return await this.client.getCollection(this.collectionName)
		} catch {
			return null
		}
	}

	async collectionExists(): Promise<boolean> {
		const info = await this.getCollectionInfo()
		return info !== null
	}

	async initialize(createIfMissing: boolean): Promise<{ created: boolean; exists: boolean }> {
		let created = false
		try {
			const info = await this.getCollectionInfo()
			if (!info) {
				if (!createIfMissing) {
					return { created: false, exists: false }
				}

				await this.createCollection()
				created = true
			} else {
				const existingSize = this.getExistingVectorSize(info)
				if (existingSize === this.vectorSize) {
					created = false
				} else {
					created = await this.recreateCollectionWithNewDimension(existingSize)
				}
			}

			await this.createPayloadIndexes()
			return { created, exists: true }
		} catch (error: any) {
			const message = error?.message || String(error)
			if (error instanceof Error && error.cause !== undefined) {
				throw error
			}

			throw new Error(`Failed to initialize Qdrant collection ${this.collectionName}: ${message}`)
		}
	}

	private getExistingVectorSize(collectionInfo: any): number {
		const vectorsConfig = collectionInfo.config?.params?.vectors
		if (typeof vectorsConfig === "number") {
			return vectorsConfig
		}

		if (
			vectorsConfig &&
			typeof vectorsConfig === "object" &&
			"size" in vectorsConfig &&
			typeof vectorsConfig.size === "number"
		) {
			return vectorsConfig.size
		}

		return 0
	}

	private async createCollection(): Promise<void> {
		await this.client.createCollection(this.collectionName, {
			vectors: {
				size: this.vectorSize,
				distance: "Cosine",
				on_disk: true,
			},
			hnsw_config: {
				m: 64,
				ef_construct: 512,
				on_disk: true,
			},
		})
	}

	private async recreateCollectionWithNewDimension(existingVectorSize: number): Promise<boolean> {
		console.warn(
			`[codebase-search] Collection ${this.collectionName} dimension mismatch (${existingVectorSize} -> ${this.vectorSize}). Recreating collection.`,
		)

		let deletionSucceeded = false
		let recreationAttempted = false

		try {
			await this.client.deleteCollection(this.collectionName)
			deletionSucceeded = true

			await new Promise((resolve) => setTimeout(resolve, 100))

			const verificationInfo = await this.getCollectionInfo()
			if (verificationInfo !== null) {
				throw new Error("Collection still exists after deletion attempt")
			}

			recreationAttempted = true
			await this.createCollection()
			return true
		} catch (recreationError) {
			const errorMessage = recreationError instanceof Error ? recreationError.message : String(recreationError)

			let contextualErrorMessage: string
			if (!deletionSucceeded) {
				contextualErrorMessage = `Failed to delete existing collection with vector size ${existingVectorSize}. ${errorMessage}`
			} else if (!recreationAttempted) {
				contextualErrorMessage = `Deleted existing collection but failed verification step. ${errorMessage}`
			} else {
				contextualErrorMessage = `Deleted existing collection but failed to create new collection with vector size ${this.vectorSize}. ${errorMessage}`
			}

			const mismatchError = new Error(
				`Failed to recreate collection ${this.collectionName} for dimension change (${existingVectorSize} -> ${this.vectorSize}). ${contextualErrorMessage}`,
			)
			mismatchError.cause = recreationError
			throw mismatchError
		}
	}

	private async createPayloadIndexes(): Promise<void> {
		const fields = [
			"type",
			"pathSegments.0",
			"pathSegments.1",
			"pathSegments.2",
			"pathSegments.3",
			"pathSegments.4",
		]
		for (const field of fields) {
			try {
				await this.client.createPayloadIndex(this.collectionName, {
					field_name: field,
					field_schema: "keyword",
				})
			} catch (error: any) {
				const message = String(error?.message || "").toLowerCase()
				if (!message.includes("already exists")) {
					console.warn(`[codebase-search] Could not create payload index ${field}:`, error?.message || error)
				}
			}
		}
	}

	async hasIndexedData(): Promise<boolean> {
		try {
			const collectionInfo = await this.getCollectionInfo()
			if (!collectionInfo) {
				return false
			}

			const pointsCount = collectionInfo.points_count ?? 0
			if (pointsCount === 0) {
				return false
			}

			const metadataId = uuidv5("__indexing_metadata__", QDRANT_CODE_BLOCK_NAMESPACE)
			const metadata = await this.client.retrieve(this.collectionName, {
				ids: [metadataId],
			})

			if (metadata.length > 0) {
				return metadata[0].payload?.indexing_complete === true
			}

			return pointsCount > 0
		} catch {
			return false
		}
	}

	async getMetadata(): Promise<CollectionMetadata | undefined> {
		try {
			const metadataId = uuidv5("__indexing_metadata__", QDRANT_CODE_BLOCK_NAMESPACE)
			const metadata = await this.client.retrieve(this.collectionName, {
				ids: [metadataId],
			})

			if (metadata.length === 0) {
				return undefined
			}

			return metadata[0].payload as CollectionMetadata
		} catch {
			return undefined
		}
	}

	async markIndexingIncomplete(): Promise<void> {
		const metadataId = uuidv5("__indexing_metadata__", QDRANT_CODE_BLOCK_NAMESPACE)
		await this.client.upsert(this.collectionName, {
			points: [
				{
					id: metadataId,
					vector: new Array(this.vectorSize).fill(0),
					payload: {
						type: "metadata",
						indexing_complete: false,
						started_at: Date.now(),
					},
				},
			],
			wait: true,
		})
	}

	async markIndexingComplete(): Promise<void> {
		const metadataId = uuidv5("__indexing_metadata__", QDRANT_CODE_BLOCK_NAMESPACE)
		await this.client.upsert(this.collectionName, {
			points: [
				{
					id: metadataId,
					vector: new Array(this.vectorSize).fill(0),
					payload: {
						type: "metadata",
						indexing_complete: true,
						completed_at: Date.now(),
					},
				},
			],
			wait: true,
		})
	}

	async upsertPoints(points: IndexPoint[]): Promise<void> {
		if (points.length === 0) {
			return
		}

		const qdrantPoints = points.map((point) => {
			const segments = point.payload.filePath.split(path.sep).filter(Boolean)
			const pathSegments = segments.reduce((acc: Record<string, string>, segment, index) => {
				acc[index.toString()] = segment
				return acc
			}, {})

			return {
				id: point.id,
				vector: point.vector,
				payload: {
					...point.payload,
					pathSegments,
				},
			}
		})

		await this.client.upsert(this.collectionName, {
			points: qdrantPoints,
			wait: true,
		})
	}

	async deletePointsByMultipleFilePaths(filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) {
			return
		}

		const filters = filePaths.map((filePath) => {
			const relativePath = path.isAbsolute(filePath) ? path.relative(this.worktree, filePath) : filePath
			const normalizedPath = path.normalize(relativePath)
			const segments = normalizedPath.split(path.sep).filter(Boolean)

			return {
				must: segments.map((segment, index) => ({
					key: `pathSegments.${index}`,
					match: { value: segment },
				})),
			}
		})

		await this.client.delete(this.collectionName, {
			filter: filters.length === 1 ? filters[0] : { should: filters },
			wait: true,
		})
	}

	async search(
		queryVector: number[],
		directoryPrefix?: string | null,
		minScore?: number,
		maxResults?: number,
	): Promise<QueryResult[]> {
		if (!(await this.collectionExists())) {
			return []
		}

		let filter:
			| {
					must?: Array<{ key: string; match: { value: string } }>
					must_not?: Array<{ key: string; match: { value: string } }>
			  }
			| undefined

		const normalizedPrefix = normalizeDirectoryPrefix(directoryPrefix)
		if (normalizedPrefix) {
			const segments = normalizedPrefix.split("/").filter(Boolean)
			if (segments.length > 0) {
				filter = {
					must: segments.map((segment, index) => ({
						key: `pathSegments.${index}`,
						match: { value: segment },
					})),
				}
			}
		}

		const metadataExclusion = {
			must_not: [{ key: "type", match: { value: "metadata" } }],
		}

		const mergedFilter = filter
			? { ...filter, must_not: [...(filter.must_not || []), ...metadataExclusion.must_not] }
			: metadataExclusion

		const result = await this.client.query(this.collectionName, {
			query: queryVector,
			filter: mergedFilter,
			score_threshold: minScore ?? DEFAULT_SEARCH_MIN_SCORE,
			limit: maxResults ?? DEFAULT_MAX_SEARCH_RESULTS,
			params: {
				hnsw_ef: 128,
				exact: false,
			},
			with_payload: {
				include: ["filePath", "codeChunk", "startLine", "endLine", "segmentHash"],
			},
		})

		return result.points
			.filter((point: any) => {
				const payload = point.payload
				return payload && payload.filePath && payload.codeChunk && payload.startLine && payload.endLine
			})
			.map((point: any) => ({
				score: point.score,
				payload: {
					filePath: point.payload.filePath,
					codeChunk: point.payload.codeChunk,
					startLine: point.payload.startLine,
					endLine: point.payload.endLine,
					segmentHash: point.payload.segmentHash,
				},
			}))
	}
}
