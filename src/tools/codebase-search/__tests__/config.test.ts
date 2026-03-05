import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { getSettingsPath } from "../config"

function withEnv<T>(updates: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
	const previous = new Map<string, string | undefined>()

	for (const [key, value] of Object.entries(updates)) {
		previous.set(key, process.env[key])
		if (value === undefined) {
			delete process.env[key]
			continue
		}

		process.env[key] = value
	}

	return run().finally(() => {
		for (const [key, value] of previous.entries()) {
			if (value === undefined) {
				delete process.env[key]
				continue
			}

			process.env[key] = value
		}
	})
}

test("getSettingsPath prefers CODEBASE_SEARCH_SETTINGS_FILE override", async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-settings-override-"))

	try {
		const worktree = path.join(tempRoot, "worktree")
		await fs.mkdir(worktree, { recursive: true })

		const overridePath = path.join("custom", "settings.override.jsonc")
		const expected = path.join(worktree, overridePath)

		await withEnv(
			{
				CODEBASE_SEARCH_SETTINGS_FILE: overridePath,
			},
			async () => {
				assert.equal(getSettingsPath(worktree), expected)
			},
		)
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true })
	}
})

test("getSettingsPath prefers worktree .opencode settings when present", async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-settings-worktree-"))

	try {
		const worktree = path.join(tempRoot, "worktree")
		const localSettingsPath = path.join(worktree, ".opencode", "codebase-search.settings.jsonc")
		await fs.mkdir(path.dirname(localSettingsPath), { recursive: true })
		await fs.writeFile(localSettingsPath, "{}\n", "utf8")

		const fakeHome = path.join(tempRoot, "home")
		const globalSettingsPath = path.join(fakeHome, ".config", "opencode", "codebase-search.settings.jsonc")
		await fs.mkdir(path.dirname(globalSettingsPath), { recursive: true })
		await fs.writeFile(globalSettingsPath, "{}\n", "utf8")

		await withEnv(
			{
				CODEBASE_SEARCH_SETTINGS_FILE: undefined,
				HOME: fakeHome,
			},
			async () => {
				assert.equal(getSettingsPath(worktree), localSettingsPath)
			},
		)
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true })
	}
})

test("getSettingsPath selects global settings when worktree settings are absent", async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-settings-global-"))

	try {
		const worktree = path.join(tempRoot, "worktree")
		await fs.mkdir(worktree, { recursive: true })

		const fakeHome = path.join(tempRoot, "home")
		const globalSettingsPath = path.join(fakeHome, ".config", "opencode", "codebase-search.settings.jsonc")
		await fs.mkdir(path.dirname(globalSettingsPath), { recursive: true })
		await fs.writeFile(globalSettingsPath, "{}\n", "utf8")

		await withEnv(
			{
				CODEBASE_SEARCH_SETTINGS_FILE: undefined,
				HOME: fakeHome,
			},
			async () => {
				assert.equal(getSettingsPath(worktree), globalSettingsPath)
			},
		)
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true })
	}
})
