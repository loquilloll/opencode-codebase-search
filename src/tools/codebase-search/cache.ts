import fs from "fs/promises"
import path from "path"

type CacheRecord = Record<string, string>

export class IndexCache {
	private hashes: CacheRecord = {}
	private exists = false

	constructor(private readonly cacheFilePath: string) {}

	get filePath(): string {
		return this.cacheFilePath
	}

	get hasExistingFile(): boolean {
		return this.exists
	}

	async load(): Promise<void> {
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
