import { randomUUID } from "crypto"

import type { PaymentRetryJob } from "../types"

const BASE_RETRY_DELAY_MS = 1500
const MAX_RETRY_ATTEMPTS = 5

export class PaymentRetryQueue {
	private queue: PaymentRetryJob[] = []

	scheduleFailure(invoiceId: string, reason: string, previousAttempt = 0): PaymentRetryJob | null {
		if (previousAttempt >= MAX_RETRY_ATTEMPTS) {
			return null
		}

		const attempt = previousAttempt + 1
		const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
		const now = Date.now()
		const job: PaymentRetryJob = {
			idempotencyKey: `retry-${invoiceId}-${attempt}`,
			invoiceId,
			attempt,
			nextRunAt: now + delay,
			reason,
		}

		this.queue.push(job)
		this.queue.sort((a, b) => a.nextRunAt - b.nextRunAt)
		return job
	}

	nextReadyJob(now = Date.now()): PaymentRetryJob | undefined {
		const next = this.queue[0]
		if (!next || next.nextRunAt > now) {
			return undefined
		}

		return this.queue.shift()
	}

	createImmediateIdempotencyKey(invoiceId: string): string {
		return `pay-${invoiceId}-${randomUUID()}`
	}

	size(): number {
		return this.queue.length
	}
}
