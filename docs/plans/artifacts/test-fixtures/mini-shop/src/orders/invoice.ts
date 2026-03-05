import { createHash } from "crypto"

import type { CartItem, Invoice } from "../types"

const TAX_RATE = 0.0825

export function calculateSubtotal(items: CartItem[]): number {
	return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
}

export function calculateTax(subtotalCents: number): number {
	return Math.round(subtotalCents * TAX_RATE)
}

export function buildInvoice(userId: string, items: CartItem[]): Invoice {
	const subtotalCents = calculateSubtotal(items)
	const taxCents = calculateTax(subtotalCents)
	const totalCents = subtotalCents + taxCents
	const createdAt = Date.now()

	return {
		id: createHash("sha1").update(`${userId}:${createdAt}:${totalCents}`).digest("hex").slice(0, 16),
		userId,
		subtotalCents,
		taxCents,
		totalCents,
		createdAt,
	}
}

export function formatInvoiceSummary(invoice: Invoice): string {
	return [
		`invoice=${invoice.id}`,
		`subtotal=${invoice.subtotalCents}`,
		`tax=${invoice.taxCents}`,
		`total=${invoice.totalCents}`,
	].join(" ")
}
