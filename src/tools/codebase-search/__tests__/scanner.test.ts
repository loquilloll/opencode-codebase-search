import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { scanSupportedFiles } from "../scanner"

function toPosixPath(filePath: string): string {
	return filePath.replace(/\\/g, "/")
}

function relativeLogicalPaths(files: Array<{ logicalAbsolutePath: string }>, worktree: string): string[] {
	return files
		.map((file) => toPosixPath(path.relative(worktree, file.logicalAbsolutePath)))
		.sort((a, b) => a.localeCompare(b))
}

function isSymlinkPermissionError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false
	}

	const code = "code" in error && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : ""
	return code === "EPERM" || code === "EACCES" || code === "ENOTSUP"
}

async function createSymlinkOrSkip(
	t: test.TestContext,
	targetPath: string,
	linkPath: string,
	type?: "dir" | "file" | "junction",
): Promise<boolean> {
	try {
		if (type) {
			await fs.symlink(targetPath, linkPath, type)
		} else {
			await fs.symlink(targetPath, linkPath)
		}
		return true
	} catch (error) {
		if (isSymlinkPermissionError(error)) {
			t.skip("Symlink creation is not permitted in this environment")
			return false
		}

		throw error
	}
}

test("scanSupportedFiles follows file and directory symlinks in workspace", async (t) => {
	const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-scan-"))

	try {
		await fs.mkdir(path.join(worktree, "src"), { recursive: true })
		await fs.mkdir(path.join(worktree, ".linked-target"), { recursive: true })
		await fs.writeFile(path.join(worktree, "src", "main.ts"), "export const main = 1\n", "utf8")
		await fs.writeFile(path.join(worktree, ".linked-target", "nested.ts"), "export const nested = 1\n", "utf8")

		if (!(await createSymlinkOrSkip(t, "main.ts", path.join(worktree, "src", "main-link.ts"), "file"))) {
			return
		}
		if (!(await createSymlinkOrSkip(t, "../.linked-target", path.join(worktree, "src", "linked"), "dir"))) {
			return
		}

		const files = await scanSupportedFiles(worktree, {
			followSymlinks: true,
			followExternalSymlinks: true,
		})
		const logicalPaths = relativeLogicalPaths(files, worktree)

		assert.equal(logicalPaths.includes("src/main.ts"), true)
		assert.equal(logicalPaths.includes("src/main-link.ts"), true)
		assert.equal(logicalPaths.includes("src/linked/nested.ts"), true)
		assert.equal(logicalPaths.includes(".linked-target/nested.ts"), false)
	} finally {
		await fs.rm(worktree, { recursive: true, force: true })
	}
})

test("scanSupportedFiles honors followExternalSymlinks toggle", async (t) => {
	const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-scan-"))
	const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-external-"))

	try {
		await fs.mkdir(path.join(worktree, "src"), { recursive: true })
		await fs.mkdir(path.join(outsideRoot, "external"), { recursive: true })
		await fs.writeFile(path.join(outsideRoot, "external", "outside.ts"), "export const outside = true\n", "utf8")

		if (
			!(await createSymlinkOrSkip(
				t,
				path.join(outsideRoot, "external"),
				path.join(worktree, "src", "external"),
				"dir",
			))
		) {
			return
		}

		const skippedExternal = await scanSupportedFiles(worktree, {
			followSymlinks: true,
			followExternalSymlinks: false,
		})
		const includedExternal = await scanSupportedFiles(worktree, {
			followSymlinks: true,
			followExternalSymlinks: true,
		})

		const skippedPaths = relativeLogicalPaths(skippedExternal, worktree)
		const includedPaths = relativeLogicalPaths(includedExternal, worktree)

		assert.equal(skippedPaths.includes("src/external/outside.ts"), false)
		assert.equal(includedPaths.includes("src/external/outside.ts"), true)
	} finally {
		await fs.rm(worktree, { recursive: true, force: true })
		await fs.rm(outsideRoot, { recursive: true, force: true })
	}
})

test("scanSupportedFiles skips broken links and prevents cyclic traversal", async (t) => {
	const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-scan-"))

	try {
		await fs.mkdir(path.join(worktree, "src"), { recursive: true })
		await fs.writeFile(path.join(worktree, "src", "entry.ts"), "export const entry = 1\n", "utf8")

		if (!(await createSymlinkOrSkip(t, "../src", path.join(worktree, "src", "loop"), "dir"))) {
			return
		}
		if (!(await createSymlinkOrSkip(t, "../missing.ts", path.join(worktree, "src", "broken.ts"), "file"))) {
			return
		}

		const files = await scanSupportedFiles(worktree, {
			followSymlinks: true,
			followExternalSymlinks: true,
		})
		const logicalPaths = relativeLogicalPaths(files, worktree)

		assert.equal(logicalPaths.includes("src/entry.ts"), true)
		assert.equal(logicalPaths.includes("src/broken.ts"), false)
		assert.equal(logicalPaths.filter((logicalPath) => logicalPath.endsWith("entry.ts")).length, 1)
	} finally {
		await fs.rm(worktree, { recursive: true, force: true })
	}
})

test("scanSupportedFiles honors .ignore rules on logical symlink alias paths", async (t) => {
	const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-scan-"))
	const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codebase-search-external-"))

	try {
		await fs.mkdir(path.join(worktree, "src"), { recursive: true })
		await fs.mkdir(path.join(outsideRoot, "external"), { recursive: true })
		await fs.writeFile(path.join(outsideRoot, "external", "outside.ts"), "export const outside = true\n", "utf8")
		await fs.writeFile(path.join(worktree, ".ignore"), "src/external/\n", "utf8")

		if (
			!(await createSymlinkOrSkip(
				t,
				path.join(outsideRoot, "external"),
				path.join(worktree, "src", "external"),
				"dir",
			))
		) {
			return
		}

		const files = await scanSupportedFiles(worktree, {
			followSymlinks: true,
			followExternalSymlinks: true,
		})
		const logicalPaths = relativeLogicalPaths(files, worktree)

		assert.equal(logicalPaths.includes("src/external/outside.ts"), false)
	} finally {
		await fs.rm(worktree, { recursive: true, force: true })
		await fs.rm(outsideRoot, { recursive: true, force: true })
	}
})
