import assert from "node:assert/strict"
import test from "node:test"

import { isDocumentationPath, queryLooksDocumentationFocused, rerankSearchResults } from "../ranking"
import type { QueryResult } from "../types"

function makeResult(filePath: string, score: number): QueryResult {
	return {
		score,
		payload: {
			filePath,
			codeChunk: "chunk",
			startLine: 1,
			endLine: 1,
		},
	}
}

test("isDocumentationPath detects common documentation paths", () => {
	assert.equal(isDocumentationPath("README.md"), true)
	assert.equal(isDocumentationPath("docs/guide.txt"), true)
	assert.equal(isDocumentationPath("src/auth/password.ts"), false)
	assert.equal(isDocumentationPath("docs\\overview.rst"), true)
})

test("queryLooksDocumentationFocused detects docs intent", () => {
	assert.equal(queryLooksDocumentationFocused("readme semantic queries overview"), true)
	assert.equal(queryLooksDocumentationFocused("show docs for indexing"), true)
	assert.equal(queryLooksDocumentationFocused("where are passwords hashed"), false)
})

test("rerankSearchResults prefers code files for code-centric query", () => {
	const raw = [makeResult("README.md", 0.6854055), makeResult("src/auth/password.ts", 0.6740656)]
	const reranked = rerankSearchResults(raw, "where are passwords hashed and verified")

	assert.equal(reranked[0]?.payload.filePath, "src/auth/password.ts")
	assert.equal(reranked[1]?.payload.filePath, "README.md")
	assert.equal(reranked[0]?.score, 0.6740656)
	assert.equal(reranked[1]?.score, 0.6854055)
})

test("rerankSearchResults prefers docs for docs-focused query", () => {
	const raw = [makeResult("README.md", 0.6854055), makeResult("src/auth/password.ts", 0.6740656)]
	const reranked = rerankSearchResults(raw, "readme semantic queries overview")

	assert.equal(reranked[0]?.payload.filePath, "README.md")
	assert.equal(reranked[1]?.payload.filePath, "src/auth/password.ts")
})
