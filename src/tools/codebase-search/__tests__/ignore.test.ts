import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildIgnoreMatcher, shouldIgnorePath } from "../ignore"

test("shouldIgnorePath honors directory rules written with trailing slash", async () => {
	const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-ignore-"))

	try {
		await fs.writeFile(path.join(worktree, ".ignore"), "src/auth/\n", "utf8")
		const matcher = await buildIgnoreMatcher(worktree)

		assert.equal(shouldIgnorePath("src/auth/password.ts", matcher), true)
		assert.equal(shouldIgnorePath("src/auth", matcher), true)
		assert.equal(shouldIgnorePath("src\\auth\\password.ts", matcher), true)
		assert.equal(shouldIgnorePath("src/orders/invoice.ts", matcher), false)
	} finally {
		await fs.rm(worktree, { recursive: true, force: true })
	}
})
