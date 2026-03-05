import path from "path"

export function toNormalizedAbsolutePath(filePath: string, worktree: string): string {
	return path.normalize(path.resolve(worktree, filePath))
}

export function toRelativeWorkspacePath(absolutePath: string, worktree: string): string {
	return path.normalize(path.relative(worktree, absolutePath))
}

export function normalizeDirectoryPrefix(prefix?: string | null): string | undefined {
	if (!prefix) {
		return undefined
	}

	const normalizedPrefix = path.posix.normalize(prefix.replace(/\\/g, "/"))
	if (normalizedPrefix === "." || normalizedPrefix === "./") {
		return undefined
	}

	return path.posix.normalize(normalizedPrefix.startsWith("./") ? normalizedPrefix.slice(2) : normalizedPrefix)
}

export function shouldIgnoreDirectoryName(dirName: string, ignoredDirs: string[]): boolean {
	return ignoredDirs.includes(dirName)
}
