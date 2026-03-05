import { access, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

async function ensureExists(filePath) {
	await access(filePath)
}

async function main() {
	const packageJson = await import(path.join(repoRoot, "package.json"), { with: { type: "json" } })
	const version = packageJson.default.version
	const archiveName = `opencode-codebase-search-v${version}.tar.gz`
	const distDir = path.join(repoRoot, "dist")
	const archivePath = path.join(distDir, archiveName)

	const releaseEntries = [
		".opencode",
		"README.md",
		"CHANGELOG.md",
		"codebase-search.settings.example.jsonc",
	]

	for (const entry of releaseEntries) {
		await ensureExists(path.join(repoRoot, entry))
	}

	await mkdir(distDir, { recursive: true })
	await rm(archivePath, { force: true })

	const result = spawnSync("tar", ["-czf", archivePath, ...releaseEntries], {
		cwd: repoRoot,
		stdio: "inherit",
	})

	if (result.status !== 0) {
		throw new Error(`tar failed with exit code ${result.status ?? "unknown"}`)
	}

	console.log(`Built release archive: ${path.relative(repoRoot, archivePath)}`)
}

await main()
