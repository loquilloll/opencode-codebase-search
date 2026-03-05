import { stat } from "node:fs/promises"
import path from "node:path"

import { collectIndexStatus } from "../src/tools/codebase-search/status"

import type { IndexStatus } from "../src/tools/codebase-search/types"

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_WATCH_INTERVAL_MS = 5_000

type OutputMode = "human" | "json" | "compact"

interface CliOptions {
	worktree: string
	timeoutMs: number
	skipDiff: boolean
	watch: boolean
	intervalMs: number
	output: OutputMode
	help: boolean
}

interface IterationDeltas {
	qdrantPoints: number
	cacheEntries: number
	indexingCompleteChanged: boolean
	previousIndexingComplete: boolean | null
	currentIndexingComplete: boolean | null
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
	let skipDiffExplicitlySet = false
	let watch = false
	let intervalMs = DEFAULT_WATCH_INTERVAL_MS
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
			skipDiffExplicitlySet = true
			continue
		}

		if (arg === "--no-skip-diff") {
			skipDiff = false
			skipDiffExplicitlySet = true
			continue
		}

		if (arg === "--watch") {
			watch = true
			continue
		}

		if (arg === "--interval-ms") {
			const value = argv[i + 1]
			if (!value || value.startsWith("--")) {
				throw new Error("Missing value for --interval-ms")
			}
			intervalMs = parsePositiveInteger(value, "--interval-ms")
			i++
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

	if (watch && !skipDiffExplicitlySet) {
		skipDiff = true
	}

	return {
		worktree,
		timeoutMs,
		skipDiff,
		watch,
		intervalMs,
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
		"  --watch             Poll index status continuously",
		"  --interval-ms <ms>  Watch poll interval in milliseconds (default: 5000)",
		"  --skip-diff         Skip dry-run reconciliation diff",
		"  --no-skip-diff      Force dry-run reconciliation diff",
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

function formatSignedNumber(value: number): string {
	if (value > 0) {
		return `+${formatNumber(value)}`
	}

	return formatNumber(value)
}

function formatDuration(durationMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60

	const hh = String(hours).padStart(2, "0")
	const mm = String(minutes).padStart(2, "0")
	const ss = String(seconds).padStart(2, "0")

	return `${hh}:${mm}:${ss}`
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

function calculateDeltas(previous: IndexStatus | null, current: IndexStatus): IterationDeltas {
	if (!previous) {
		return {
			qdrantPoints: 0,
			cacheEntries: 0,
			indexingCompleteChanged: false,
			previousIndexingComplete: current.qdrant.indexingComplete,
			currentIndexingComplete: current.qdrant.indexingComplete,
		}
	}

	return {
		qdrantPoints: current.qdrant.pointsCount - previous.qdrant.pointsCount,
		cacheEntries: current.cache.entryCount - previous.cache.entryCount,
		indexingCompleteChanged: current.qdrant.indexingComplete !== previous.qdrant.indexingComplete,
		previousIndexingComplete: previous.qdrant.indexingComplete,
		currentIndexingComplete: current.qdrant.indexingComplete,
	}
}

function formatIndexingCompleteDelta(deltas: IterationDeltas): string {
	if (!deltas.indexingCompleteChanged) {
		return `unchanged (${String(deltas.currentIndexingComplete)})`
	}

	return `${String(deltas.previousIndexingComplete)} -> ${String(deltas.currentIndexingComplete)}`
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

function renderWatchHumanStatus(
	status: IndexStatus,
	iteration: number,
	intervalMs: number,
	elapsedMs: number,
	deltas: IterationDeltas,
): string {
	const lines: string[] = []

	lines.push("Watch")
	lines.push(`  iteration: ${formatNumber(iteration)}`)
	lines.push(`  interval: ${formatNumber(intervalMs)}ms`)
	lines.push(`  elapsed: ${formatDuration(elapsedMs)}`)
	lines.push(`  delta qdrant points: ${formatSignedNumber(deltas.qdrantPoints)}`)
	lines.push(`  delta cache entries: ${formatSignedNumber(deltas.cacheEntries)}`)
	lines.push(`  delta indexing complete: ${formatIndexingCompleteDelta(deltas)}`)
	lines.push("")
	lines.push(renderHumanStatus(status))

	return lines.join("\n")
}

function renderWatchJsonLine(
	status: IndexStatus,
	iteration: number,
	intervalMs: number,
	elapsedMs: number,
	deltas: IterationDeltas,
): string {
	return JSON.stringify({
		iteration,
		intervalMs,
		elapsedMs,
		deltas,
		status,
	})
}

function installWatchSignalHandlers(signalState: { stopRequested: boolean; signal: NodeJS.Signals | null }): () => void {
	const onSignal = (signal: NodeJS.Signals): void => {
		signalState.stopRequested = true
		signalState.signal = signal
	}

	process.on("SIGINT", onSignal)
	process.on("SIGTERM", onSignal)

	return () => {
		process.off("SIGINT", onSignal)
		process.off("SIGTERM", onSignal)
	}
}

async function sleepWithStop(intervalMs: number, signalState: { stopRequested: boolean }): Promise<void> {
	const deadline = Date.now() + intervalMs
	while (!signalState.stopRequested) {
		const remainingMs = deadline - Date.now()
		if (remainingMs <= 0) {
			return
		}

		const stepMs = Math.min(remainingMs, 250)
		await new Promise<void>((resolve) => {
			setTimeout(resolve, stepMs)
		})
	}
}

function renderWatchFinalSummary(
	iteration: number,
	startedAt: number,
	firstStatus: IndexStatus | null,
	lastStatus: IndexStatus | null,
	signal: NodeJS.Signals | null,
): string {
	const lines: string[] = []
	const elapsedMs = Date.now() - startedAt

	lines.push("")
	lines.push(`Watch stopped${signal ? ` (${signal})` : ""}`)
	lines.push(`  iterations: ${formatNumber(iteration)}`)
	lines.push(`  total elapsed: ${formatDuration(elapsedMs)}`)

	if (!firstStatus || !lastStatus) {
		lines.push("  aggregate deltas: no iterations completed")
		return lines.join("\n")
	}

	const aggregateDeltas = calculateDeltas(firstStatus, lastStatus)
	lines.push(`  aggregate qdrant points: ${formatSignedNumber(aggregateDeltas.qdrantPoints)}`)
	lines.push(`  aggregate cache entries: ${formatSignedNumber(aggregateDeltas.cacheEntries)}`)
	lines.push(`  aggregate indexing complete: ${formatIndexingCompleteDelta(aggregateDeltas)}`)

	return lines.join("\n")
}

async function runWatch(options: CliOptions): Promise<void> {
	const signalState: { stopRequested: boolean; signal: NodeJS.Signals | null } = {
		stopRequested: false,
		signal: null,
	}
	const uninstallHandlers = installWatchSignalHandlers(signalState)

	const startedAt = Date.now()
	let iteration = 0
	let firstStatus: IndexStatus | null = null
	let previousStatus: IndexStatus | null = null
	let lastStatus: IndexStatus | null = null

	try {
		while (!signalState.stopRequested) {
			const status = await collectIndexStatus(options.worktree, {
				timeoutMs: options.timeoutMs,
				skipDiff: options.skipDiff,
			})

			iteration++
			const elapsedMs = Date.now() - startedAt
			const deltas = calculateDeltas(previousStatus, status)

			if (options.output === "human") {
				process.stdout.write("\x1Bc")
				process.stdout.write(`${renderWatchHumanStatus(status, iteration, options.intervalMs, elapsedMs, deltas)}\n`)
			} else {
				process.stdout.write(`${renderWatchJsonLine(status, iteration, options.intervalMs, elapsedMs, deltas)}\n`)
			}

			if (!firstStatus) {
				firstStatus = status
			}
			previousStatus = status
			lastStatus = status

			if (signalState.stopRequested) {
				break
			}

			await sleepWithStop(options.intervalMs, signalState)
		}
	} finally {
		uninstallHandlers()
	}

	if (options.output === "human") {
		process.stdout.write(`${renderWatchFinalSummary(iteration, startedAt, firstStatus, lastStatus, signalState.signal)}\n`)
	}
}

async function run(): Promise<void> {
	const options = parseArgs(process.argv.slice(2))
	if (options.help) {
		printHelp()
		return
	}

	await assertWorktreeDirectory(options.worktree)

	if (options.watch) {
		await runWatch(options)
		return
	}

	const status = await collectIndexStatus(options.worktree, {
		timeoutMs: options.timeoutMs,
		skipDiff: options.skipDiff,
	})

	process.stdout.write(`${renderOutput(status, options.output)}\n`)
}

run().catch((error) => {
	process.stderr.write(`Error: ${toErrorMessage(error)}\n`)
	process.exit(1)
})
