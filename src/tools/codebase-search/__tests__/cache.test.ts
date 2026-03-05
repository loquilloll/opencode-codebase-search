import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { IndexCache } from "../cache"
import { getCacheFilePath, getCollectionName, getLegacyCacheFilePath } from "../config"

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

test("getCacheFilePath resolves to local-share single-file layout", () => {
	const worktree = path.join(os.tmpdir(), "codebase-search-cache-path")
	const expected = path.join(
		os.homedir(),
		".local",
		"share",
		"opencode-codebase-search",
		`${getCollectionName(worktree)}.cache.json`,
	)

	assert.equal(getCacheFilePath(worktree), expected)
})

test("IndexCache migrates legacy cache into canonical path on load", async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-cache-migration-"))

	try {
		const canonicalPath = path.join(tempRoot, "new", "ws-test.cache.json")
		const legacyPath = path.join(tempRoot, "workspace", ".opencode", "codebase-search", "ws-test.cache.json")
		await fs.mkdir(path.dirname(legacyPath), { recursive: true })
		await fs.writeFile(legacyPath, JSON.stringify({ "src/main.ts": "hash-main" }, null, 2), "utf8")

		const cache = new IndexCache(canonicalPath, legacyPath)
		await cache.load()

		assert.equal(cache.hasExistingFile, true)
		assert.equal(cache.getHash("src/main.ts"), "hash-main")
		assert.equal(await fileExists(canonicalPath), true)
		assert.equal(await fileExists(legacyPath), false)
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true })
	}
})

test("IndexCache prefers canonical cache when both canonical and legacy files exist", async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-cache-canonical-"))

	try {
		const worktree = path.join(tempRoot, "workspace")
		const canonicalPath = getCacheFilePath(worktree)
		const legacyPath = getLegacyCacheFilePath(worktree)

		await fs.mkdir(path.dirname(canonicalPath), { recursive: true })
		await fs.mkdir(path.dirname(legacyPath), { recursive: true })
		await fs.writeFile(canonicalPath, JSON.stringify({ "src/main.ts": "canonical-hash" }, null, 2), "utf8")
		await fs.writeFile(legacyPath, JSON.stringify({ "src/main.ts": "legacy-hash" }, null, 2), "utf8")

		const cache = new IndexCache(canonicalPath, legacyPath)
		await cache.load()

		assert.equal(cache.hasExistingFile, true)
		assert.equal(cache.getHash("src/main.ts"), "canonical-hash")
		assert.equal(await fileExists(canonicalPath), true)
		assert.equal(await fileExists(legacyPath), false)
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true })
	}
})
