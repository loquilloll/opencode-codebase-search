type CacheEntry<T> = {
	value: T
	expiresAt: number
	touchedAt: number
}

export class TtlLruCache<T> {
	private items = new Map<string, CacheEntry<T>>()

	constructor(
		private readonly maxSize: number,
		private readonly ttlMs: number,
	) {}

	get(key: string): T | undefined {
		const entry = this.items.get(key)
		if (!entry) {
			return undefined
		}

		if (entry.expiresAt <= Date.now()) {
			this.items.delete(key)
			return undefined
		}

		entry.touchedAt = Date.now()
		this.items.set(key, entry)
		return entry.value
	}

	set(key: string, value: T): void {
		const now = Date.now()
		this.items.set(key, {
			value,
			expiresAt: now + this.ttlMs,
			touchedAt: now,
		})

		this.evictExpired(now)
		this.evictLeastRecentlyUsed()
	}

	has(key: string): boolean {
		return this.get(key) !== undefined
	}

	private evictExpired(now: number): void {
		for (const [key, entry] of this.items.entries()) {
			if (entry.expiresAt <= now) {
				this.items.delete(key)
			}
		}
	}

	private evictLeastRecentlyUsed(): void {
		if (this.items.size <= this.maxSize) {
			return
		}

		const oldest = [...this.items.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0]
		if (oldest) {
			this.items.delete(oldest[0])
		}
	}
}
