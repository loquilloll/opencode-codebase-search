export const MAX_BLOCK_CHARS = 1000
export const MIN_BLOCK_CHARS = 50
export const MIN_CHUNK_REMAINDER_CHARS = 200
export const MAX_CHARS_TOLERANCE_FACTOR = 1.15

export const DEFAULT_SEARCH_MIN_SCORE = 0.4
export const DEFAULT_MAX_SEARCH_RESULTS = 20

export const QDRANT_CODE_BLOCK_NAMESPACE = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
export const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024

export const MAX_BATCH_TOKENS = 100000
export const MAX_ITEM_TOKENS = 8191
export const BATCH_SEGMENT_THRESHOLD = 60

export const DEFAULT_QDRANT_URL = "http://localhost:6333"
export const DEFAULT_INDEX_MODE = "disabled"
export const DEFAULT_FOLLOW_SYMLINKS = true
export const DEFAULT_FOLLOW_EXTERNAL_SYMLINKS = true

export const MAX_BATCH_RETRIES = 3
export const INITIAL_RETRY_DELAY_MS = 500

export const DEFAULT_IGNORED_DIRS = [
	".git",
	"node_modules",
	"dist",
	"out",
	"build",
	"vendor",
	"tmp",
	"temp",
	"target",
	"coverage",
	".next",
	".nuxt",
	".turbo",
	".idea",
	".vscode",
	".opencode",
]
