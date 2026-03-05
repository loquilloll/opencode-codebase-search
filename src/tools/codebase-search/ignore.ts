import fs from "fs/promises"
import path from "path"
import ignore from "ignore"

import { DEFAULT_IGNORED_DIRS } from "./constants"

async function addIgnoreFile(
	matcher: ReturnType<typeof ignore>,
	worktree: string,
	fileName: string,
	ignoreFileItself = true,
): Promise<void> {
	const filePath = path.join(worktree, fileName)
	try {
		const content = await fs.readFile(filePath, "utf8")
		matcher.add(content)
		if (ignoreFileItself) {
			matcher.add(fileName)
		}
	} catch {
		// no-op
	}
}

export async function buildIgnoreMatcher(worktree: string) {
	const matcher = ignore()

	// Ignore hidden paths by default, while still allowing explicit reinclusion.
	matcher.add(".*")
	matcher.add(".*/**")
	matcher.add("!.github")
	matcher.add("!.github/**")

	for (const dir of DEFAULT_IGNORED_DIRS) {
		matcher.add(`${dir}/**`)
	}

	await addIgnoreFile(matcher, worktree, ".gitignore")
	await addIgnoreFile(matcher, worktree, ".rooignore")

	// OpenCode first-class ignore file (applied last so it can override earlier patterns).
	await addIgnoreFile(matcher, worktree, ".ignore")

	return matcher
}

export function shouldIgnorePath(relativePath: string, matcher: ReturnType<typeof ignore>): boolean {
	const normalizedPath = relativePath.replace(/\\/g, "/")
	return matcher.ignores(normalizedPath) || matcher.ignores(`${normalizedPath}/`)
}
