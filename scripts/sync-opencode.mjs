import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

const sourceToolsDir = path.join(repoRoot, "src", "tools")
const sourcePluginsDir = path.join(repoRoot, "src", "plugins")
const runtimeDir = path.join(repoRoot, ".opencode")

function shouldSkip(relativePath) {
	const normalized = relativePath.replace(/\\/g, "/")
	if (
		normalized === "__tests__" ||
		normalized.startsWith("__tests__/") ||
		normalized.includes("/__tests__/") ||
		normalized.endsWith("/__tests__")
	) {
		return true
	}

	const base = path.basename(normalized)
	if (base.endsWith(".test.ts") || base === ".DS_Store") {
		return true
	}

	return false
}

async function removeIfExists(targetPath) {
	try {
		const info = await stat(targetPath)
		if (info.isDirectory()) {
			await rm(targetPath, { recursive: true, force: true })
			return
		}

		await rm(targetPath, { force: true })
	} catch {
		// path does not exist
	}
}

async function copyFiltered(sourceDir, destinationDir) {
	await cp(sourceDir, destinationDir, {
		recursive: true,
		filter: (source) => {
			const relative = path.relative(sourceDir, source)
			if (!relative || relative === ".") {
				return true
			}

			return !shouldSkip(relative)
		},
	})
}

async function main() {
	await removeIfExists(runtimeDir)
	await mkdir(runtimeDir, { recursive: true })

	await copyFiltered(sourceToolsDir, path.join(runtimeDir, "tools"))
	await copyFiltered(sourcePluginsDir, path.join(runtimeDir, "plugins"))

	const runtimeReadme = [
		"# codebase_search runtime",
		"",
		"Generated from `src/` by `npm run sync:opencode`.",
		"",
		"For full documentation, see:",
		"- repository `README.md`",
		"- `docs/ARCHITECTURE.md`",
		"- `docs/RELEASING.md`",
	].join("\n")
	await writeFile(path.join(runtimeDir, "tools", "codebase-search", "README.md"), runtimeReadme + "\n", "utf8")

	const rootPackageRaw = await readFile(path.join(repoRoot, "package.json"), "utf8")
	const rootPackage = JSON.parse(rootPackageRaw)

	const runtimePackage = {
		name: "opencode-codebase-search-runtime",
		version: rootPackage.version,
		private: true,
		type: "module",
		dependencies: rootPackage.dependencies ?? {},
	}

	await writeFile(path.join(runtimeDir, "package.json"), JSON.stringify(runtimePackage, null, 2) + "\n", "utf8")

	console.log("Generated .opencode runtime from src/")
}

await main()
