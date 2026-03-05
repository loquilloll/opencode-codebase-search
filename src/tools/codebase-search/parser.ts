import { createHash } from "crypto"
import * as path from "path"
import type { Node } from "web-tree-sitter"

import { MAX_BLOCK_CHARS, MAX_CHARS_TOLERANCE_FACTOR, MIN_BLOCK_CHARS, MIN_CHUNK_REMAINDER_CHARS } from "./constants"
import { shouldUseFallbackChunking } from "./extensions"
import type { ParsedBlock } from "./types"
import { loadRequiredLanguageParsers, type LanguageParser } from "./tree-sitter/language-parser"
import { parseMarkdown } from "./tree-sitter/markdown-parser"

function hashContent(input: string): string {
	return createHash("sha256").update(input).digest("hex")
}

function createSegmentHash(filePath: string, startLine: number, endLine: number, content: string): string {
	const contentPreview = content.slice(0, 100)
	return hashContent(`${filePath}-${startLine}-${endLine}-${content.length}-${contentPreview}`)
}

function createOversizedLineSegmentHash(
	filePath: string,
	originalLineNumber: number,
	startCharIndex: number,
	segment: string,
): string {
	const segmentPreview = segment.slice(0, 100)
	return hashContent(
		`${filePath}-${originalLineNumber}-${originalLineNumber}-${startCharIndex}-${segment.length}-${segmentPreview}`,
	)
}

export function createFileHash(content: string): string {
	return hashContent(content)
}

class CodeParser {
	private loadedParsers: LanguageParser = {}
	private pendingLoads: Map<string, Promise<LanguageParser>> = new Map()

	async parseTextIntoBlocks(filePath: string, content: string, fileHash: string): Promise<ParsedBlock[]> {
		const extensionWithDot = path.extname(filePath).toLowerCase()
		const extension = extensionWithDot.slice(1)
		const seenSegmentHashes = new Set<string>()

		if (extension === "md" || extension === "markdown") {
			return this.parseMarkdownContent(filePath, content, fileHash, seenSegmentHashes)
		}

		if (shouldUseFallbackChunking(extensionWithDot)) {
			return this.performFallbackChunking(filePath, content, fileHash, seenSegmentHashes)
		}

		const parserKey = extension === "ejs" || extension === "erb" ? "embedded_template" : extension
		if (!this.loadedParsers[parserKey]) {
			const pendingLoad = this.pendingLoads.get(parserKey)
			if (pendingLoad) {
				try {
					await pendingLoad
				} catch {
					return []
				}
			} else {
				const loadPromise = loadRequiredLanguageParsers([filePath])
				this.pendingLoads.set(parserKey, loadPromise)
				try {
					const parsers = await loadPromise
					if (parsers) {
						this.loadedParsers = { ...this.loadedParsers, ...parsers }
					}
				} catch {
					return []
				} finally {
					this.pendingLoads.delete(parserKey)
				}
			}
		}

		const language = this.loadedParsers[parserKey]
		if (!language) {
			return []
		}

		const tree = language.parser.parse(content)
		const captures = tree ? language.query.captures(tree.rootNode) : []

		if (captures.length === 0) {
			if (content.length >= MIN_BLOCK_CHARS) {
				return this.performFallbackChunking(filePath, content, fileHash, seenSegmentHashes)
			}

			return []
		}

		const results: ParsedBlock[] = []
		const queue: Node[] = Array.from(captures).map((capture) => capture.node)

		while (queue.length > 0) {
			const currentNode = queue.shift()!

			if (currentNode.text.length < MIN_BLOCK_CHARS) {
				continue
			}

			if (currentNode.text.length > MAX_BLOCK_CHARS * MAX_CHARS_TOLERANCE_FACTOR) {
				if (currentNode.children.length > 0) {
					queue.push(...currentNode.children)
				} else {
					const chunkedBlocks = this.chunkLeafNodeByLines(currentNode, filePath, fileHash, seenSegmentHashes)
					results.push(...chunkedBlocks)
				}
				continue
			}

			const startLine = currentNode.startPosition.row + 1
			const endLine = currentNode.endPosition.row + 1
			const nodeContent = currentNode.text
			const segmentHash = createSegmentHash(filePath, startLine, endLine, nodeContent)

			if (!seenSegmentHashes.has(segmentHash)) {
				seenSegmentHashes.add(segmentHash)
				results.push({
					filePath,
					startLine,
					endLine,
					content: nodeContent,
					segmentHash,
					fileHash,
				})
			}
		}

		return results
	}

	private chunkTextByLines(
		lines: string[],
		filePath: string,
		fileHash: string,
		seenSegmentHashes: Set<string>,
		baseStartLine = 1,
	): ParsedBlock[] {
		const chunks: ParsedBlock[] = []
		let currentChunkLines: string[] = []
		let currentChunkLength = 0
		let chunkStartLineIndex = 0
		const effectiveMaxChars = MAX_BLOCK_CHARS * MAX_CHARS_TOLERANCE_FACTOR

		const finalizeChunk = (endLineIndex: number) => {
			if (currentChunkLength >= MIN_BLOCK_CHARS && currentChunkLines.length > 0) {
				const chunkContent = currentChunkLines.join("\n")
				const startLine = baseStartLine + chunkStartLineIndex
				const endLine = baseStartLine + endLineIndex
				const segmentHash = createSegmentHash(filePath, startLine, endLine, chunkContent)

				if (!seenSegmentHashes.has(segmentHash)) {
					seenSegmentHashes.add(segmentHash)
					chunks.push({
						filePath,
						startLine,
						endLine,
						content: chunkContent,
						segmentHash,
						fileHash,
					})
				}
			}

			currentChunkLines = []
			currentChunkLength = 0
			chunkStartLineIndex = endLineIndex + 1
		}

		const createSegmentBlock = (segment: string, originalLineNumber: number, startCharIndex: number) => {
			const segmentHash = createOversizedLineSegmentHash(filePath, originalLineNumber, startCharIndex, segment)
			if (!seenSegmentHashes.has(segmentHash)) {
				seenSegmentHashes.add(segmentHash)
				chunks.push({
					filePath,
					startLine: originalLineNumber,
					endLine: originalLineNumber,
					content: segment,
					segmentHash,
					fileHash,
				})
			}
		}

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const lineLength = line.length + (i < lines.length - 1 ? 1 : 0)
			const originalLineNumber = baseStartLine + i

			if (lineLength > effectiveMaxChars) {
				if (currentChunkLines.length > 0) {
					finalizeChunk(i - 1)
				}

				let remainingLineContent = line
				let currentSegmentStartChar = 0
				while (remainingLineContent.length > 0) {
					const segment = remainingLineContent.substring(0, MAX_BLOCK_CHARS)
					remainingLineContent = remainingLineContent.substring(MAX_BLOCK_CHARS)
					createSegmentBlock(segment, originalLineNumber, currentSegmentStartChar)
					currentSegmentStartChar += MAX_BLOCK_CHARS
				}

				chunkStartLineIndex = i + 1
				continue
			}

			if (currentChunkLength > 0 && currentChunkLength + lineLength > effectiveMaxChars) {
				let splitIndex = i - 1
				let remainderLength = 0
				for (let j = i; j < lines.length; j++) {
					remainderLength += lines[j].length + (j < lines.length - 1 ? 1 : 0)
				}

				if (
					currentChunkLength >= MIN_BLOCK_CHARS &&
					remainderLength < MIN_CHUNK_REMAINDER_CHARS &&
					currentChunkLines.length > 1
				) {
					for (let k = i - 2; k >= chunkStartLineIndex; k--) {
						const potentialChunkLines = lines.slice(chunkStartLineIndex, k + 1)
						const potentialChunkLength = potentialChunkLines.join("\n").length + 1
						const potentialNextChunkLines = lines.slice(k + 1)
						const potentialNextChunkLength = potentialNextChunkLines.join("\n").length + 1

						if (
							potentialChunkLength >= MIN_BLOCK_CHARS &&
							potentialNextChunkLength >= MIN_CHUNK_REMAINDER_CHARS
						) {
							splitIndex = k
							break
						}
					}
				}

				finalizeChunk(splitIndex)

				if (i >= chunkStartLineIndex) {
					currentChunkLines.push(line)
					currentChunkLength += lineLength
				} else {
					i = chunkStartLineIndex - 1
					continue
				}
			} else {
				currentChunkLines.push(line)
				currentChunkLength += lineLength
			}
		}

		if (currentChunkLines.length > 0) {
			finalizeChunk(lines.length - 1)
		}

		return chunks
	}

	private performFallbackChunking(
		filePath: string,
		content: string,
		fileHash: string,
		seenSegmentHashes: Set<string>,
	): ParsedBlock[] {
		const lines = content.split("\n")
		return this.chunkTextByLines(lines, filePath, fileHash, seenSegmentHashes)
	}

	private chunkLeafNodeByLines(
		node: Node,
		filePath: string,
		fileHash: string,
		seenSegmentHashes: Set<string>,
	): ParsedBlock[] {
		const lines = node.text.split("\n")
		const baseStartLine = node.startPosition.row + 1
		return this.chunkTextByLines(lines, filePath, fileHash, seenSegmentHashes, baseStartLine)
	}

	private processMarkdownSection(
		lines: string[],
		filePath: string,
		fileHash: string,
		seenSegmentHashes: Set<string>,
		startLine: number,
	): ParsedBlock[] {
		const content = lines.join("\n")
		if (content.trim().length < MIN_BLOCK_CHARS) {
			return []
		}

		const needsChunking =
			content.length > MAX_BLOCK_CHARS * MAX_CHARS_TOLERANCE_FACTOR ||
			lines.some((line) => line.length > MAX_BLOCK_CHARS * MAX_CHARS_TOLERANCE_FACTOR)

		if (needsChunking) {
			return this.chunkTextByLines(lines, filePath, fileHash, seenSegmentHashes, startLine)
		}

		const endLine = startLine + lines.length - 1
		const segmentHash = createSegmentHash(filePath, startLine, endLine, content)
		if (seenSegmentHashes.has(segmentHash)) {
			return []
		}

		seenSegmentHashes.add(segmentHash)
		return [
			{
				filePath,
				startLine,
				endLine,
				content,
				segmentHash,
				fileHash,
			},
		]
	}

	private parseMarkdownContent(
		filePath: string,
		content: string,
		fileHash: string,
		seenSegmentHashes: Set<string>,
	): ParsedBlock[] {
		const lines = content.split("\n")
		const markdownCaptures = parseMarkdown(content) || []

		if (markdownCaptures.length === 0) {
			return this.processMarkdownSection(lines, filePath, fileHash, seenSegmentHashes, 1)
		}

		const results: ParsedBlock[] = []
		let lastProcessedLine = 0

		const firstHeaderLine = markdownCaptures[0]?.node.startPosition.row ?? 0
		if (firstHeaderLine > 0) {
			const preHeaderLines = lines.slice(0, firstHeaderLine)
			const preHeaderBlocks = this.processMarkdownSection(
				preHeaderLines,
				filePath,
				fileHash,
				seenSegmentHashes,
				1,
			)
			results.push(...preHeaderBlocks)
		}

		for (let i = 0; i < markdownCaptures.length; i += 2) {
			if (i + 1 >= markdownCaptures.length) {
				break
			}

			const definitionCapture = markdownCaptures[i + 1]
			if (!definitionCapture) {
				continue
			}

			const startLine = definitionCapture.node.startPosition.row + 1
			const endLine = definitionCapture.node.endPosition.row + 1
			const sectionLines = lines.slice(startLine - 1, endLine)

			const sectionBlocks = this.processMarkdownSection(
				sectionLines,
				filePath,
				fileHash,
				seenSegmentHashes,
				startLine,
			)
			results.push(...sectionBlocks)
			lastProcessedLine = endLine
		}

		if (lastProcessedLine < lines.length) {
			const remainingLines = lines.slice(lastProcessedLine)
			const remainingBlocks = this.processMarkdownSection(
				remainingLines,
				filePath,
				fileHash,
				seenSegmentHashes,
				lastProcessedLine + 1,
			)
			results.push(...remainingBlocks)
		}

		return results
	}
}

const parser = new CodeParser()

export async function parseTextIntoBlocks(filePath: string, content: string, fileHash: string): Promise<ParsedBlock[]> {
	return parser.parseTextIntoBlocks(filePath, content, fileHash)
}
