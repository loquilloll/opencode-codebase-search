import type { Plugin } from "@opencode-ai/plugin"

import { loadIndexConfig } from "../tools/codebase-search/config"
import { scheduleBackgroundIndex } from "../tools/codebase-search/background-index-queue"

const WATCHED_EVENTS = new Set(["session.created", "file.watcher.updated", "session.idle"])

export const CodebaseIndexWorkerPlugin: Plugin = async ({ worktree }) => {
	return {
		event: async ({ event }) => {
			if (!event || !WATCHED_EVENTS.has(event.type)) {
				return
			}

			const config = loadIndexConfig(worktree)
			if (config.indexMode !== "background") {
				return
			}

			scheduleBackgroundIndex(worktree, `plugin:${event.type}`, event.type === "file.watcher.updated")
		},
	}
}

export default CodebaseIndexWorkerPlugin
