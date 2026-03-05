import { loadIndexConfig, validateProviderConfig } from "./config"
import { createEmbedder } from "./embedders"
import { ensureIndexFresh } from "./indexer"

type QueueState = {
	running: boolean
	pendingUrgent: boolean
	timer?: ReturnType<typeof setTimeout>
	lastRunAt?: number
	lastReason?: string
	lastError?: string
}

const states = new Map<string, QueueState>()
const DEFAULT_DEBOUNCE_MS = 1500
const URGENT_DEBOUNCE_MS = 100

function getState(worktree: string): QueueState {
	const existing = states.get(worktree)
	if (existing) {
		return existing
	}

	const created: QueueState = {
		running: false,
		pendingUrgent: false,
	}

	states.set(worktree, created)
	return created
}

async function runIndexing(worktree: string, reason: string): Promise<void> {
	const state = getState(worktree)
	if (state.running) {
		return
	}

	state.running = true
	state.lastReason = reason
	state.lastError = undefined

	try {
		const config = loadIndexConfig(worktree, "background")
		if (config.indexMode !== "background") {
			return
		}

		validateProviderConfig(config)
		const embedder = createEmbedder(config)
		await ensureIndexFresh(config, embedder)
		state.lastRunAt = Date.now()
	} catch (error) {
		state.lastError = error instanceof Error ? error.message : String(error)
		console.warn("[codebase-search] Background indexing failed:", state.lastError)
	} finally {
		state.running = false
	}
}

export function scheduleBackgroundIndex(worktree: string, reason: string, urgent = false): void {
	const state = getState(worktree)

	if (urgent) {
		state.pendingUrgent = true
	}

	if (state.timer) {
		clearTimeout(state.timer)
	}

	const delay = urgent ? URGENT_DEBOUNCE_MS : DEFAULT_DEBOUNCE_MS
	state.timer = setTimeout(async () => {
		state.timer = undefined
		await runIndexing(worktree, reason)

		if (state.pendingUrgent) {
			state.pendingUrgent = false
			await runIndexing(worktree, "urgent-followup")
		}
	}, delay)
}

export function getBackgroundIndexStatus(worktree: string): {
	running: boolean
	pending: boolean
	lastRunAt?: number
	lastReason?: string
	lastError?: string
} {
	const state = getState(worktree)
	return {
		running: state.running,
		pending: Boolean(state.timer) || state.pendingUrgent,
		lastRunAt: state.lastRunAt,
		lastReason: state.lastReason,
		lastError: state.lastError,
	}
}
