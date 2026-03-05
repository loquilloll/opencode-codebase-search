export interface UserRecord {
	id: string
	email: string
	passwordHash: string
	displayName: string
}

export interface SessionRecord {
	id: string
	userId: string
	token: string
	expiresAt: number
	rotatedFrom?: string
}

export interface CartItem {
	sku: string
	quantity: number
	unitPriceCents: number
}

export interface Invoice {
	id: string
	userId: string
	subtotalCents: number
	taxCents: number
	totalCents: number
	createdAt: number
}

export interface PaymentRetryJob {
	idempotencyKey: string
	invoiceId: string
	attempt: number
	nextRunAt: number
	reason: string
}
