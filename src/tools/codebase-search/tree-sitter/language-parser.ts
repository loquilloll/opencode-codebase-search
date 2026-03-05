import * as path from "path"
import { createRequire } from "module"
import {
	Parser,
	Language,
	Query,
	type Parser as ParserT,
	type Language as LanguageT,
	type Query as QueryT,
} from "web-tree-sitter"

import {
	javascriptQuery,
	typescriptQuery,
	tsxQuery,
	pythonQuery,
	rustQuery,
	goQuery,
	cppQuery,
	cQuery,
	csharpQuery,
	rubyQuery,
	javaQuery,
	phpQuery,
	htmlQuery,
	swiftQuery,
	kotlinQuery,
	cssQuery,
	ocamlQuery,
	solidityQuery,
	tomlQuery,
	vueQuery,
	luaQuery,
	systemrdlQuery,
	tlaPlusQuery,
	zigQuery,
	embeddedTemplateQuery,
	elispQuery,
	elixirQuery,
} from "./queries"

export interface LanguageParser {
	[key: string]: {
		parser: ParserT
		query: QueryT
	}
}

const require = createRequire(import.meta.url)
let parserInitialized = false
let cachedWasmDirectory: string | undefined

function resolveWasmDirectory(): string {
	if (cachedWasmDirectory) {
		return cachedWasmDirectory
	}

	const packageJsonPath = require.resolve("tree-sitter-wasms/package.json")
	cachedWasmDirectory = path.join(path.dirname(packageJsonPath), "out")
	return cachedWasmDirectory
}

async function loadLanguage(langName: string, sourceDirectory?: string): Promise<LanguageT> {
	const baseDir = sourceDirectory || resolveWasmDirectory()
	const wasmPath = path.join(baseDir, `tree-sitter-${langName}.wasm`)
	return Language.load(wasmPath)
}

function getLanguageConfig(ext: string): {
	languageName: string
	query: string
	parserKey?: string
} {
	switch (ext) {
		case "js":
		case "jsx":
		case "json":
			return { languageName: "javascript", query: javascriptQuery }
		case "ts":
			return { languageName: "typescript", query: typescriptQuery }
		case "tsx":
			return { languageName: "tsx", query: tsxQuery }
		case "py":
			return { languageName: "python", query: pythonQuery }
		case "rs":
			return { languageName: "rust", query: rustQuery }
		case "go":
			return { languageName: "go", query: goQuery }
		case "cpp":
		case "hpp":
			return { languageName: "cpp", query: cppQuery }
		case "c":
		case "h":
			return { languageName: "c", query: cQuery }
		case "cs":
			return { languageName: "c_sharp", query: csharpQuery }
		case "rb":
			return { languageName: "ruby", query: rubyQuery }
		case "java":
			return { languageName: "java", query: javaQuery }
		case "php":
			return { languageName: "php", query: phpQuery }
		case "swift":
			return { languageName: "swift", query: swiftQuery }
		case "kt":
		case "kts":
			return { languageName: "kotlin", query: kotlinQuery }
		case "css":
			return { languageName: "css", query: cssQuery }
		case "html":
		case "htm":
			return { languageName: "html", query: htmlQuery }
		case "ml":
		case "mli":
			return { languageName: "ocaml", query: ocamlQuery }
		case "sol":
			return { languageName: "solidity", query: solidityQuery }
		case "toml":
			return { languageName: "toml", query: tomlQuery }
		case "vue":
			return { languageName: "vue", query: vueQuery }
		case "lua":
			return { languageName: "lua", query: luaQuery }
		case "rdl":
			return { languageName: "systemrdl", query: systemrdlQuery }
		case "tla":
			return { languageName: "tlaplus", query: tlaPlusQuery }
		case "zig":
			return { languageName: "zig", query: zigQuery }
		case "ejs":
		case "erb":
			return {
				languageName: "embedded_template",
				query: embeddedTemplateQuery,
				parserKey: "embedded_template",
			}
		case "el":
			return { languageName: "elisp", query: elispQuery }
		case "ex":
		case "exs":
			return { languageName: "elixir", query: elixirQuery }
		default:
			throw new Error(`Unsupported tree-sitter language extension: ${ext}`)
	}
}

export async function loadRequiredLanguageParsers(
	filesToParse: string[],
	sourceDirectory?: string,
): Promise<LanguageParser> {
	if (!parserInitialized) {
		await Parser.init()
		parserInitialized = true
	}

	const extensionsToLoad = new Set(filesToParse.map((file) => path.extname(file).toLowerCase().slice(1)))
	const parsers: LanguageParser = {}

	for (const ext of extensionsToLoad) {
		if (!ext || ext === "md" || ext === "markdown") {
			continue
		}

		const config = getLanguageConfig(ext)
		const language = await loadLanguage(config.languageName, sourceDirectory)
		const query = new Query(language, config.query)
		const parser = new Parser()
		parser.setLanguage(language)
		parsers[config.parserKey || ext] = { parser, query }
	}

	return parsers
}
