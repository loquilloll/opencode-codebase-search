import { createHash, randomBytes } from "crypto"

import type { SessionRecord } from "../types"

const SESSION_TTL_MS = 1000 * 60 * 60 * 24

export function issueSession(userId: string, rotatedFrom?: string): SessionRecord {
	const now = Date.now()
	const token = randomBytes(32).toString("base64url")

	return {
		id: createHash("sha256").update(`${userId}:${token}:${now}`).digest("hex").slice(0, 20),
		userId,
		token,
		expiresAt: now + SESSION_TTL_MS,
		rotatedFrom,
	}
}

export function shouldRotateSession(session: SessionRecord): boolean {
	const now = Date.now()
	const ageRemaining = session.expiresAt - now
	return ageRemaining < SESSION_TTL_MS / 4
}
