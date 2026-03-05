import { stat } from "node:fs/promises"
import path from "node:path"

import { collectIndexStatus } from "../src/tools/codebase-search/status"

import type { IndexStatus } from "../src/tools/codebase-search/types"

const DEFAULT_TIMEOUT_MS = 10_000

type OutputMode = "human" | "json" | "compact"

interface CliOptions {
	worktree: string
	timeoutMs: number
	skipDiff: boolean
	output: OutputMode
	help: boolean
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}

	return String(error)
}

function parsePositiveInteger(raw: string, flagName: string): number {
	const value = Number(raw)
	if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
		throw new Error(`${flagName} must be a positive integer: ${raw}`)
	}

	return value
}

function parseArgs(argv: string[]): CliOptions {
	let worktree = process.cwd()
	let timeoutMs = DEFAULT_TIMEOUT_MS
	let skipDiff = false
	let output: OutputMode = "human"
	let help = false

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]

		if (arg === "--worktree") {
			const value = argv[i + 1]
			if (!value || value.startsWith("--")) {
				throw new Error("Missing value for --worktree")
			}
			worktree = path.resolve(value)
			i++
			continue
		}

		if (arg === "--timeout-ms") {
			const value = argv[i + 1]
			if (!value || value.startsWith("--")) {
				throw new Error("Missing value for --timeout-ms")
			}
			timeoutMs = parsePositiveInteger(value, "--timeout-ms")
			i++
			continue
		}

		if (arg === "--skip-diff") {
			skipDiff = true
			continue
		}

		if (arg === "--json") {
			output = "json"
			continue
		}

		if (arg === "--compact") {
			output = "compact"
			continue
		}

		if (arg === "--help") {
			help = true
			continue
		}

		throw new Error(`Unknown argument: ${arg}`)
	}

	return {
		worktree,
		timeoutMs,
		skipDiff,
		output,
		help,
	}
}

function printHelp(): void {
	const lines = [
		"Usage: tsx scripts/codebase-index-status.ts [options]",
		"",
		"Options:",
		"  --worktree <path>   Target worktree path (default: process.cwd())",
		"  --timeout-ms <ms>   Qdrant probe timeout in milliseconds (default: 10000)",
		"  --skip-diff         Skip dry-run reconciliation diff",
		"  --json              Print pretty JSON output",
		"  --compact           Print compact single-line JSON output",
		"  --help              Show this help text",
	]

	process.stdout.write(`${lines.join("\n")}\n`)
}

async function assertWorktreeDirectory(worktree: string): Promise<void> {
	let info
	try {
		info = await stat(worktree)
	} catch (error) {
		throw new Error(`Worktree does not exist: ${worktree} (${toErrorMessage(error)})`)
	}

	if (!info.isDirectory()) {
		throw new Error(`Worktree is not a directory: ${worktree}`)
	}
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US").format(value)
}

function formatCompletedAt(timestamp: number | null): string {
	if (!timestamp) {
		return "n/a"
	}

	const date = new Date(timestamp)
	if (Number.isNaN(date.getTime())) {
		return "invalid timestamp"
	}

	return date.toISOString()
}

function formatSeverity(severity: "ok" | "warning" | "problem"): string {
	switch (severity) {
		case "ok":
			return "ok"
		case "warning":
			return "warning"
		case "problem":
			return "problem"
		default:
			return severity
	}
}

function renderHumanStatus(status: IndexStatus): string {
	const lines: string[] = []

	lines.push(`Index Status ${status.timestamp}`)
	lines.push("----------------------------------------")
	lines.push("")

	lines.push("Config")
	lines.push(`  settings: ${status.config.settingsFilePath}`)
	lines.push(
		`  provider: ${status.config.provider} / ${status.config.modelId}${status.config.modelDimension ? ` (${status.config.modelDimension}d)` : ""}`,
	)
	lines.push(`  mode: ${status.config.indexMode}`)
	lines.push(`  qdrant: ${status.config.qdrantUrl}`)
	lines.push(`  symlinks: follow=${status.config.followSymlinks} external=${status.config.followExternalSymlinks}`)
	lines.push("")

	lines.push("Qdrant")
	lines.push(`  collection: ${status.qdrant.collectionName}`)
	lines.push(`  status: ${status.qdrant.reachable ? "reachable" : "unreachable"}`)
	lines.push(`  points: ${formatNumber(status.qdrant.pointsCount)}`)
	lines.push(`  collection exists: ${status.qdrant.collectionExists}`)
	lines.push(`  indexing complete: ${status.qdrant.indexingComplete === null ? "unknown" : status.qdrant.indexingComplete}`)
	lines.push(`  last completed: ${formatCompletedAt(status.qdrant.lastCompletedAt)}`)
	if (status.qdrant.error) {
		lines.push(`  error: ${status.qdrant.error}`)
	}
	lines.push("")

	lines.push("Cache")
	lines.push(`  path: ${status.cache.filePath}`)
	lines.push(`  exists: ${status.cache.exists}`)
	lines.push(`  entries: ${formatNumber(status.cache.entryCount)}`)
	lines.push(`  legacy path: ${status.cache.legacyFilePath}`)
	lines.push(`  legacy exists: ${status.cache.legacyExists}`)
	lines.push("")

	lines.push("Worktree")
	lines.push(`  path: ${status.worktree.worktree}`)
	lines.push(`  indexable: ${formatNumber(status.worktree.indexableFileCount)} files`)
	lines.push(`  scan time: ${status.worktree.scanDurationMs}ms`)
	lines.push("")

	if (status.diff) {
		lines.push("Reconciliation Preview")
		lines.push(`  changed: ${formatNumber(status.diff.changedFiles)} files`)
		lines.push(`  new: ${formatNumber(status.diff.newFiles)} files`)
		lines.push(`  deleted: ${formatNumber(status.diff.deletedFiles)} files`)
		lines.push(`  skipped: ${formatNumber(status.diff.skippedFiles)} files`)
		lines.push(`  estimated blocks: ${formatNumber(status.diff.estimatedBlocks)}`)
		lines.push(`  estimated batches: ${formatNumber(status.diff.estimatedBatches)}`)
		lines.push(`  diff time: ${status.diff.diffDurationMs}ms`)
		lines.push("")
	}

	lines.push("Mode Assessments")
	for (const assessment of status.assessments) {
		lines.push(`  ${assessment.mode}: ${formatSeverity(assessment.severity)} - ${assessment.explanation}`)
	}

	return lines.join("\n")
}

function renderOutput(status: IndexStatus, output: OutputMode): string {
	if (output === "json") {
		return JSON.stringify(status, null, 2)
	}

	if (output === "compact") {
		return JSON.stringify(status)
	}

	return renderHumanStatus(status)
}

async function run(): Promise<void> {
	const options = parseArgs(process.argv.slice(2))
	if (options.help) {
		printHelp()
		return
	}

	await assertWorktreeDirectory(options.worktree)

	const status = await collectIndexStatus(options.worktree, {
		timeoutMs: options.timeoutMs,
		skipDiff: options.skipDiff,
	})

	process.stdout.write(`${renderOutput(status, options.output)}\n`)
}

process.once("SIGINT", () => {
	process.stderr.write("Interrupted\n")
	process.exit(130)
})

run().catch((error) => {
	process.stderr.write(`Error: ${toErrorMessage(error)}\n`)
	process.exit(1)
})
