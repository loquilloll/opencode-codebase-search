import assert from "node:assert/strict"
import test from "node:test"

import { collectIndexStatus } from "../status"

function withEnv<T>(key: string, value: string | undefined, run: () => Promise<T>): Promise<T> {
	const previous = process.env[key]

	if (value === undefined) {
		delete process.env[key]
	} else {
		process.env[key] = value
	}

	return run().finally(() => {
		if (previous === undefined) {
			delete process.env[key]
		} else {
			process.env[key] = previous
		}
	})
}

test("collectIndexStatus returns a well-shaped status object", async () => {
	const status = await collectIndexStatus(process.cwd(), { timeoutMs: 2_000 })

	assert.equal(typeof status.timestamp, "string")
	assert.equal(typeof status.config.settingsFilePath, "string")
	assert.equal(typeof status.config.provider, "string")
	assert.equal(typeof status.qdrant.reachable, "boolean")
	assert.equal(typeof status.cache.filePath, "string")
	assert.equal(typeof status.worktree.worktree, "string")
	assert.equal(Array.isArray(status.assessments), true)
	assert.equal(status.assessments.length, 3)

	if (status.diff) {
		assert.equal(status.diff.changedFiles >= 0, true)
		assert.equal(status.diff.newFiles >= 0, true)
		assert.equal(status.diff.deletedFiles >= 0, true)
		assert.equal(status.diff.skippedFiles >= 0, true)
		assert.equal(status.diff.estimatedBlocks >= 0, true)
		assert.equal(status.diff.estimatedBatches >= 0, true)
	}
})

test("collectIndexStatus returns diff null when skipDiff is enabled", async () => {
	const status = await collectIndexStatus(process.cwd(), { skipDiff: true, timeoutMs: 2_000 })
	assert.equal(status.diff, null)
})

test("collectIndexStatus reports unreachable qdrant as structured status", async () => {
	const status = await withEnv("CODEBASE_SEARCH_QDRANT_URL", "http://127.0.0.1:1", () =>
		collectIndexStatus(process.cwd(), { timeoutMs: 200, skipDiff: true }),
	)

	assert.equal(status.qdrant.reachable, false)
	assert.equal(typeof status.qdrant.error, "string")
	assert.equal((status.qdrant.error || "").length > 0, true)
})

test("collectIndexStatus assessments include disabled query and background", async () => {
	const status = await collectIndexStatus(process.cwd(), { skipDiff: true, timeoutMs: 2_000 })
	const modes = new Set(status.assessments.map((assessment) => assessment.mode))

	assert.equal(modes.has("disabled"), true)
	assert.equal(modes.has("query"), true)
	assert.equal(modes.has("background"), true)
})

test("collectIndexStatus reports indexable files for current repository", async () => {
	const status = await collectIndexStatus(process.cwd(), { skipDiff: true, timeoutMs: 2_000 })
	assert.equal(status.worktree.indexableFileCount > 0, true)
})
