import type { QueryResult } from "./types"

const DOC_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".rst", ".adoc"])

export function isDocumentationPath(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, "/").toLowerCase()
	for (const ext of DOC_EXTENSIONS) {
		if (normalized.endsWith(ext)) {
			return true
		}
	}

	return normalized.endsWith("/readme") || normalized.includes("/docs/")
}

export function queryLooksDocumentationFocused(query: string): boolean {
	const normalized = query.toLowerCase()
	return /\b(readme|docs?|documentation|guide|tutorial|explain|overview)\b/.test(normalized)
}

function scoreWeightForResult(filePath: string, docsFocusedQuery: boolean): number {
	const isDoc = isDocumentationPath(filePath)
	if (docsFocusedQuery) {
		return isDoc ? 1.08 : 0.98
	}

	return isDoc ? 0.9 : 1.03
}

export function rerankSearchResults(rawResults: QueryResult[], query: string): QueryResult[] {
	const docsFocusedQuery = queryLooksDocumentationFocused(query)

	return [...rawResults].sort((left, right) => {
		const leftWeighted = left.score * scoreWeightForResult(left.payload.filePath, docsFocusedQuery)
		const rightWeighted = right.score * scoreWeightForResult(right.payload.filePath, docsFocusedQuery)
		if (rightWeighted !== leftWeighted) {
			return rightWeighted - leftWeighted
		}

		return right.score - left.score
	})
}
