import fs from "fs/promises"
import path from "path"

import { DEFAULT_IGNORED_DIRS } from "./constants"
import { SUPPORTED_EXTENSIONS } from "./extensions"
import { buildIgnoreMatcher, shouldIgnorePath } from "./ignore"
import { shouldIgnoreDirectoryName, toRelativeWorkspacePath } from "./utils/paths"

type ScannerOptions = {
	followSymlinks: boolean
	followExternalSymlinks: boolean
}

export type ScannedFile = {
	logicalAbsolutePath: string
	resolvedAbsolutePath: string
}

function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
	const relative = path.relative(rootPath, candidatePath)
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function tryResolveRealPath(absolutePath: string): Promise<string | undefined> {
	try {
		return await fs.realpath(absolutePath)
	} catch {
		return undefined
	}
}

export async function scanSupportedFiles(worktree: string, options: ScannerOptions): Promise<ScannedFile[]> {
	const matcher = await buildIgnoreMatcher(worktree)
	const files: ScannedFile[] = []

	const resolvedWorktree = (await tryResolveRealPath(worktree)) ?? path.resolve(worktree)
	const activeRealDirectories = new Set<string>()

	const walk = async (logicalAbsoluteDir: string, realAbsoluteDir: string) => {
		const resolvedRealDir = (await tryResolveRealPath(realAbsoluteDir)) ?? path.resolve(realAbsoluteDir)
		if (activeRealDirectories.has(resolvedRealDir)) {
			return
		}

		activeRealDirectories.add(resolvedRealDir)

		try {
			const entries = await fs.readdir(realAbsoluteDir, { withFileTypes: true })
			entries.sort((a, b) => a.name.localeCompare(b.name))

			for (const entry of entries) {
				const logicalAbsolutePath = path.join(logicalAbsoluteDir, entry.name)
				const logicalRelativePath = toRelativeWorkspacePath(logicalAbsolutePath, worktree)

				if (entry.isDirectory()) {
					if (shouldIgnoreDirectoryName(entry.name, DEFAULT_IGNORED_DIRS)) {
						continue
					}

					if (shouldIgnorePath(logicalRelativePath, matcher)) {
						continue
					}

					await walk(logicalAbsolutePath, path.join(realAbsoluteDir, entry.name))
					continue
				}

				if (entry.isFile()) {
					if (shouldIgnorePath(logicalRelativePath, matcher)) {
						continue
					}

					const ext = path.extname(logicalAbsolutePath).toLowerCase()
					if (!SUPPORTED_EXTENSIONS.includes(ext)) {
						continue
					}

					files.push({
						logicalAbsolutePath,
						resolvedAbsolutePath: path.join(realAbsoluteDir, entry.name),
					})
					continue
				}

				if (!entry.isSymbolicLink() || !options.followSymlinks) {
					continue
				}

				if (shouldIgnorePath(logicalRelativePath, matcher)) {
					continue
				}

				const symlinkAbsolutePath = path.join(realAbsoluteDir, entry.name)
				const resolvedTarget = await tryResolveRealPath(symlinkAbsolutePath)
				if (!resolvedTarget) {
					continue
				}

				if (!options.followExternalSymlinks && !isPathInsideRoot(resolvedTarget, resolvedWorktree)) {
					continue
				}

				let targetStats: Awaited<ReturnType<typeof fs.stat>>
				try {
					targetStats = await fs.stat(resolvedTarget)
				} catch {
					continue
				}

				if (targetStats.isDirectory()) {
					if (shouldIgnoreDirectoryName(entry.name, DEFAULT_IGNORED_DIRS)) {
						continue
					}

					await walk(logicalAbsolutePath, resolvedTarget)
					continue
				}

				if (!targetStats.isFile()) {
					continue
				}

				const logicalExt = path.extname(logicalAbsolutePath).toLowerCase()
				const targetExt = path.extname(resolvedTarget).toLowerCase()
				if (!SUPPORTED_EXTENSIONS.includes(logicalExt) && !SUPPORTED_EXTENSIONS.includes(targetExt)) {
					continue
				}

				files.push({
					logicalAbsolutePath,
					resolvedAbsolutePath: resolvedTarget,
				})
			}
		} catch {
			return
		} finally {
			activeRealDirectories.delete(resolvedRealDir)
		}
	}

	await walk(worktree, worktree)
	return files
}
