import { hashPassword, verifyPassword } from "./auth/password"
import { issueSession, shouldRotateSession } from "./auth/session"
import { TtlLruCache } from "./cache/lru"
import { buildInvoice, formatInvoiceSummary } from "./orders/invoice"
import { PaymentRetryQueue } from "./orders/retryQueue"

async function demoAuthFlow() {
	const hash = await hashPassword("correct horse battery staple")
	const ok = await verifyPassword("correct horse battery staple", hash)
	const session = issueSession("user_42")

	return {
		ok,
		needsRotation: shouldRotateSession(session),
	}
}

function demoCheckoutFlow() {
	const invoice = buildInvoice("user_42", [
		{ sku: "book-001", quantity: 1, unitPriceCents: 2599 },
		{ sku: "cable-002", quantity: 2, unitPriceCents: 899 },
	])

	const retries = new PaymentRetryQueue()
	const retry = retries.scheduleFailure(invoice.id, "gateway timeout")

	return {
		invoiceSummary: formatInvoiceSummary(invoice),
		retry,
	}
}

function demoCacheFlow() {
	const cache = new TtlLruCache<string>(2, 30_000)
	cache.set("user:42:recommendations", "book-001,book-002")
	cache.set("user:42:recent-orders", "inv-001,inv-002")
	cache.set("user:42:wishlist", "book-003")

	return {
		hasRecommendations: cache.has("user:42:recommendations"),
		hasWishlist: cache.has("user:42:wishlist"),
	}
}

async function main() {
	const auth = await demoAuthFlow()
	const checkout = demoCheckoutFlow()
	const cache = demoCacheFlow()

	console.log({ auth, checkout, cache })
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
