import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

async function assertDirectory(targetPath, label) {
	const info = await lstat(targetPath)
	if (!info.isDirectory()) {
		throw new Error(`${label} must be a directory: ${targetPath}`)
	}
}

async function assertFile(targetPath, label) {
	const info = await lstat(targetPath)
	if (!info.isFile()) {
		throw new Error(`${label} must be a file: ${targetPath}`)
	}
}

async function walkPaths(rootDir) {
	const results = []
	const entries = await readdir(rootDir, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = path.join(rootDir, entry.name)
		results.push(fullPath)
		if (entry.isDirectory()) {
			results.push(...(await walkPaths(fullPath)))
			continue
		}
	}

	return results
}

async function main() {
	const runtimeDir = path.join(repoRoot, ".opencode")

	await assertDirectory(runtimeDir, "Generated runtime")
	await assertDirectory(path.join(runtimeDir, "tools"), "Runtime tools")
	await assertDirectory(path.join(runtimeDir, "plugins"), "Runtime plugins")
	await assertFile(path.join(runtimeDir, "package.json"), "Runtime package")
	await assertFile(path.join(runtimeDir, "tools", "codebase_search.ts"), "Tool entrypoint")
	await assertFile(path.join(runtimeDir, "plugins", "codebase-index-worker.ts"), "Plugin entrypoint")

	const runtimePaths = await walkPaths(runtimeDir)
	const forbiddenSegments = ["__tests__", "plans", "test-fixtures", "test-evidence"]
	for (const runtimePath of runtimePaths) {
		const normalized = runtimePath.replace(/\\/g, "/")
		for (const segment of forbiddenSegments) {
			if (normalized.includes(`/${segment}/`)) {
				throw new Error(`Forbidden segment '${segment}' found in runtime payload: ${normalized}`)
			}

			if (normalized.endsWith(`/${segment}`)) {
				throw new Error(`Forbidden segment '${segment}' found in runtime payload: ${normalized}`)
			}
		}
	}

	const packageRaw = await readFile(path.join(runtimeDir, "package.json"), "utf8")
	const runtimePackage = JSON.parse(packageRaw)
	if (!runtimePackage.dependencies || Object.keys(runtimePackage.dependencies).length === 0) {
		throw new Error("Runtime package.json is missing dependencies")
	}

	console.log("Release verification passed")
}

await main()
