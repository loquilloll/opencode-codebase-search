import fs from "fs/promises"
import path from "path"

type CacheRecord = Record<string, string>

export class IndexCache {
	private hashes: CacheRecord = {}
	private exists = false

	constructor(
		private readonly cacheFilePath: string,
		private readonly legacyCacheFilePath?: string,
	) {}

	get filePath(): string {
		return this.cacheFilePath
	}

	get hasExistingFile(): boolean {
		return this.exists
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath)
			return true
		} catch {
			return false
		}
	}

	private isCrossDeviceError(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			typeof (error as { code?: unknown }).code === "string" &&
			(error as { code: string }).code === "EXDEV"
		)
	}

	private async removeLegacyIfPresent(): Promise<void> {
		if (!this.legacyCacheFilePath || this.legacyCacheFilePath === this.cacheFilePath) {
			return
		}

		if (!(await this.fileExists(this.legacyCacheFilePath))) {
			return
		}

		try {
			await fs.unlink(this.legacyCacheFilePath)
		} catch {}
	}

	private async migrateLegacyCacheIfNeeded(): Promise<void> {
		if (!this.legacyCacheFilePath || this.legacyCacheFilePath === this.cacheFilePath) {
			return
		}

		const hasCanonical = await this.fileExists(this.cacheFilePath)
		if (hasCanonical) {
			await this.removeLegacyIfPresent()
			return
		}

		if (!(await this.fileExists(this.legacyCacheFilePath))) {
			return
		}

		await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true })

		try {
			await fs.rename(this.legacyCacheFilePath, this.cacheFilePath)
			return
		} catch (error) {
			if (!this.isCrossDeviceError(error)) {
				return
			}
		}

		try {
			await fs.copyFile(this.legacyCacheFilePath, this.cacheFilePath)
			await fs.unlink(this.legacyCacheFilePath)
		} catch {}
	}

	async load(): Promise<void> {
		await this.migrateLegacyCacheIfNeeded()

		try {
			const content = await fs.readFile(this.cacheFilePath, "utf8")
			const parsed = JSON.parse(content)
			this.hashes = typeof parsed === "object" && parsed ? parsed : {}
			this.exists = true
		} catch {
			this.hashes = {}
			this.exists = false
		}
	}

	getHash(filePath: string): string | undefined {
		return this.hashes[filePath]
	}

	setHash(filePath: string, hash: string): void {
		this.hashes[filePath] = hash
	}

	deleteHash(filePath: string): void {
		delete this.hashes[filePath]
	}

	getAllHashes(): CacheRecord {
		return { ...this.hashes }
	}

	replaceAll(next: CacheRecord): void {
		this.hashes = { ...next }
	}

	async save(): Promise<void> {
		await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true })
		await fs.writeFile(this.cacheFilePath, JSON.stringify(this.hashes, null, 2), "utf8")
		this.exists = true
	}
}
