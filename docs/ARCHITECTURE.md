# Architecture

## System Context (C4 Level 1)

How opencode-codebase-search fits into the broader development environment.

```mermaid
graph TB
    Dev[Developer] -->|invokes| OC[OpenCode CLI]
    OC -->|tool call| Tool[codebase_search Tool]
    Tool -->|embed + search| Qdrant[(Qdrant Vector DB)]
    Tool -->|generate embeddings| EmbedAPI[Embedding API]

    RooCode[Roo Code Extension] -->|shares index| Qdrant

    subgraph ExtProviders["Embedding Providers"]
        direction LR
        OpenAI[OpenAI API]
        Ollama[Ollama Local]
        Gemini[Gemini API]
        Bedrock[AWS Bedrock]
        Mistral[Mistral API]
        ORouter[OpenRouter]
        Vercel[Vercel AI GW]
    end

    EmbedAPI --- ExtProviders

    classDef user fill:#FFE4B5,stroke:#333,stroke-width:2px,color:#000
    classDef tool fill:#90EE90,stroke:#2E8B57,stroke-width:2px,color:darkgreen
    classDef db fill:#E6E6FA,stroke:#6A5ACD,stroke-width:2px,color:darkblue
    classDef ext fill:#87CEEB,stroke:#4682B4,stroke-width:2px,color:darkblue
    classDef provider fill:#FAFAD2,stroke:#DAA520,stroke-width:1px,color:#000

    class Dev user
    class OC,Tool,RooCode tool
    class Qdrant db
    class EmbedAPI ext
    class OpenAI,Ollama,Gemini,Bedrock,Mistral,ORouter,Vercel provider
```

**Key relationships:**

- The developer interacts with OpenCode CLI, which discovers and calls `codebase_search`
- The tool connects to a local or remote Qdrant instance for vector storage/search
- Embeddings are generated via one of 8 supported provider backends
- Roo Code can share the same Qdrant collection -- indexes are compatible and concurrent

---

## Container View (C4 Level 2)

Internal containers showing the tool entrypoint, search engine, plugin, and external services.

```mermaid
graph TB
    subgraph OpenCode["OpenCode Runtime"]
        direction TB
        ToolEntry["codebase_search.ts\nTool Entrypoint"]
        Plugin["codebase-index-worker.ts\nBackground Plugin"]

        subgraph Engine["Search Engine Core"]
            direction TB
            Orchestrator["engine.ts\nMode Orchestrator"]
            Config["config.ts\nSettings Loader"]
            Indexer["indexer.ts\nIndex Pipeline"]
            Search["searchIndex()\nVector Search"]
            Ranker["ranking.ts\nResult Reranker"]
            BGQueue["background-index-queue.ts\nDebounced Scheduler"]
        end
    end

    subgraph Storage["External Services"]
        direction TB
        Qdrant[(Qdrant\nVector Database)]
        FS[(Filesystem\nSource Files)]
    end

    subgraph Providers["Embedding Providers"]
        direction TB
        EmbedFactory["embedders/index.ts\nFactory"]
        OpenAIEmb["OpenAI Family"]
        OllamaEmb["Ollama"]
        BedrockEmb["AWS Bedrock"]
    end

    ToolEntry -->|"runCodebaseSearch()"| Orchestrator
    Plugin -->|"scheduleBackgroundIndex()"| BGQueue
    BGQueue -->|"ensureIndexFresh()"| Indexer
    Orchestrator --> Config
    Orchestrator -->|"query mode"| Indexer
    Orchestrator -->|"background mode"| BGQueue
    Orchestrator -->|"all modes"| Search
    Search --> Ranker
    Indexer --> FS
    Indexer -->|upsert vectors| Qdrant
    Search -->|similarity search| Qdrant
    Orchestrator --> EmbedFactory
    EmbedFactory --> OpenAIEmb
    EmbedFactory --> OllamaEmb
    EmbedFactory --> BedrockEmb

    classDef entry fill:#90EE90,stroke:#2E8B57,stroke-width:2px,color:darkgreen
    classDef core fill:#87CEEB,stroke:#4682B4,stroke-width:2px,color:darkblue
    classDef storage fill:#E6E6FA,stroke:#6A5ACD,stroke-width:2px,color:darkblue
    classDef embed fill:#FAFAD2,stroke:#DAA520,stroke-width:2px,color:#000
    classDef plugin fill:#FFB6C1,stroke:#DC143C,stroke-width:2px,color:#000

    class ToolEntry,Plugin entry
    class Orchestrator,Config,Indexer,Search,Ranker,BGQueue core
    class Qdrant,FS storage
    class EmbedFactory,OpenAIEmb,OllamaEmb,BedrockEmb embed
```

---

## Component Diagram -- Module Boundaries

Detailed internal module dependencies showing the import graph.

```mermaid
graph LR
    subgraph Entrypoint
        Tool["codebase_search.ts"]
    end

    subgraph Core
        Engine["engine.ts"]
        Indexer["indexer.ts"]
        Config["config.ts"]
        BGQ["background-index-queue.ts"]
        Ranking["ranking.ts"]
    end

    subgraph Parsing
        Parser["parser.ts"]
        Scanner["scanner.ts"]
        Extensions["extensions.ts"]
        Ignore["ignore.ts"]
        TreeSitter["tree-sitter/\nlanguage-parser.ts"]
        MDParser["tree-sitter/\nmarkdown-parser.ts"]
        Queries["tree-sitter/queries/\n28 language files"]
    end

    subgraph VectorStore
        QdrantMod["qdrant.ts"]
        Cache["cache.ts"]
    end

    subgraph Embedders
        Factory["embedders/index.ts"]
        Base["embedders/base.ts"]
        OAIFamily["embedders/\nopenai-family.ts"]
        Ollama["embedders/\nollama.ts"]
        Bedrock["embedders/\nbedrock.ts"]
    end

    subgraph Shared
        Types["types.ts"]
        Constants["constants.ts"]
        ModelProf["model-profiles.ts"]
        HashUtil["utils/hash.ts"]
        PathUtil["utils/paths.ts"]
    end

    subgraph Plugin
        Worker["codebase-index-\nworker.ts"]
    end

    Tool --> Engine
    Engine --> Config
    Engine --> Indexer
    Engine --> Factory
    Engine --> BGQ
    Engine --> Ranking

    Indexer --> Scanner
    Indexer --> Parser
    Indexer --> QdrantMod
    Indexer --> Cache
    Indexer --> Config

    Scanner --> Ignore
    Scanner --> Extensions
    Scanner --> PathUtil

    Parser --> TreeSitter
    Parser --> MDParser
    Parser --> Extensions
    TreeSitter --> Queries

    Factory --> OAIFamily
    Factory --> Ollama
    Factory --> Bedrock
    OAIFamily --> Base
    Ollama --> Base
    Bedrock --> Base
    Base --> ModelProf

    QdrantMod --> HashUtil
    QdrantMod --> PathUtil
    Config --> ModelProf
    Config --> HashUtil

    BGQ --> Config
    BGQ --> Factory
    BGQ --> Indexer

    Worker --> Config
    Worker --> BGQ

    classDef entry fill:#90EE90,stroke:#2E8B57,stroke-width:2px,color:darkgreen
    classDef core fill:#87CEEB,stroke:#4682B4,stroke-width:2px,color:darkblue
    classDef parse fill:#FFE4B5,stroke:#D2691E,stroke-width:2px,color:#000
    classDef vector fill:#E6E6FA,stroke:#6A5ACD,stroke-width:2px,color:darkblue
    classDef embed fill:#FAFAD2,stroke:#DAA520,stroke-width:2px,color:#000
    classDef shared fill:#D3D3D3,stroke:#696969,stroke-width:1px,color:#000
    classDef plugin fill:#FFB6C1,stroke:#DC143C,stroke-width:2px,color:#000

    class Tool entry
    class Engine,Indexer,Config,BGQ,Ranking core
    class Parser,Scanner,Extensions,Ignore,TreeSitter,MDParser,Queries parse
    class QdrantMod,Cache vector
    class Factory,Base,OAIFamily,Ollama,Bedrock embed
    class Types,Constants,ModelProf,HashUtil,PathUtil shared
    class Worker plugin
```

---

## Sequence Diagram -- Query Mode Search Flow

End-to-end request flow when a user invokes `codebase_search` in `query` mode.

```mermaid
sequenceDiagram
    participant User as Developer
    participant OC as OpenCode CLI
    participant Tool as codebase_search
    participant Engine as engine.ts
    participant Config as config.ts
    participant Embedder as Embedder
    participant Indexer as indexer.ts
    participant Scanner as scanner.ts
    participant Parser as parser.ts
    participant Cache as IndexCache
    participant Qdrant as Qdrant DB
    participant Ranker as ranking.ts

    User->>OC: codebase_search(query, mode=query)
    OC->>Tool: execute(args, context)
    Tool->>Engine: runCodebaseSearch(request, worktree)

    Engine->>Config: loadIndexConfig(worktree)
    Config-->>Engine: IndexConfig

    Engine->>Config: validateProviderConfig(config)
    Engine->>Embedder: createEmbedder(config)

    Note over Engine: mode = "query" -> sync index first

    Engine->>Indexer: ensureIndexFresh(config, embedder)

    Indexer->>Scanner: scanSupportedFiles(worktree, config)
    Scanner->>Scanner: walk dirs, apply ignore rules
    Scanner-->>Indexer: ScannedFile[]

    Indexer->>Cache: load()
    Cache-->>Indexer: {path: hash} map

    loop For each changed/new file
        Indexer->>Parser: parseTextIntoBlocks(content, ext)
        Parser->>Parser: tree-sitter AST or fallback chunking
        Parser-->>Indexer: ParsedBlock[]
    end

    loop Batch embedding
        Indexer->>Embedder: createEmbeddings(texts[])
        Embedder-->>Indexer: vectors[]
    end

    Indexer->>Qdrant: upsertPoints(vectors, payloads)
    Indexer->>Qdrant: deletePointsByMultipleFilePaths(removed)
    Indexer->>Cache: save()
    Indexer-->>Engine: IndexingSummary

    Engine->>Indexer: searchIndex(query, config, embedder)
    Indexer->>Embedder: createEmbeddings([query])
    Embedder-->>Indexer: queryVector
    Indexer->>Qdrant: search(queryVector, filters)
    Qdrant-->>Indexer: scored results
    Indexer-->>Engine: CodeSearchResult[]

    Engine->>Ranker: rerankSearchResults(results, query)
    Ranker-->>Engine: reranked results

    Engine-->>Tool: SearchResponse
    Tool-->>OC: JSON string
    OC-->>User: formatted results
```

---

## Activity Diagram -- Indexing Pipeline

The incremental indexing workflow that runs during `query` mode or background refresh.

```mermaid
flowchart TD
    Start([Start: ensureIndexFresh]) --> LoadConfig[Load IndexConfig]
    LoadConfig --> InitQdrant[Initialize QdrantIndexStore]
    InitQdrant --> CheckCollection{Collection exists?}

    CheckCollection -->|No| CreateCollection[Create collection with\ncorrect dimensions]
    CheckCollection -->|Yes| CheckDimension{Dimension match?}

    CheckDimension -->|Yes| ScanFiles
    CheckDimension -->|No| Recreate[Delete + recreate collection\nClear cache]

    CreateCollection --> ScanFiles
    Recreate --> ScanFiles

    ScanFiles[Scan filesystem\nscanner.ts] --> LoadCache[Load IndexCache]
    LoadCache --> CompareHashes{Compare file hashes\nwith cache}

    CompareHashes --> Changed[Identify changed/new files]
    CompareHashes --> Removed[Identify deleted files]

    Changed --> ParseLoop{Files to parse?}
    ParseLoop -->|Yes| ParseFile[Parse file into blocks\nparser.ts]
    ParseFile --> EmbedBatch[Batch embed blocks\nembedder.createEmbeddings]
    EmbedBatch --> UpsertBatch[Upsert vectors to Qdrant]
    UpsertBatch --> ParseLoop
    ParseLoop -->|No| HandleDeleted

    Removed --> HandleDeleted{Deleted files?}
    HandleDeleted -->|Yes| DeletePoints[Delete points\nfrom Qdrant]
    HandleDeleted -->|No| SaveCache

    DeletePoints --> SaveCache[Save updated cache]
    SaveCache --> MarkComplete[Mark indexing complete\nin Qdrant metadata]
    MarkComplete --> Done([Return IndexingSummary])

    classDef start fill:#90EE90,stroke:#2E8B57,stroke-width:2px,color:darkgreen
    classDef process fill:#87CEEB,stroke:#4682B4,stroke-width:2px,color:darkblue
    classDef decision fill:#FFD700,stroke:#333,stroke-width:2px,color:#000
    classDef storage fill:#E6E6FA,stroke:#6A5ACD,stroke-width:2px,color:darkblue
    classDef error fill:#FFB6C1,stroke:#DC143C,stroke-width:2px,color:#000

    class Start,Done start
    class LoadConfig,ScanFiles,LoadCache,Changed,Removed,ParseFile,EmbedBatch process
    class CheckCollection,CheckDimension,CompareHashes,ParseLoop,HandleDeleted decision
    class InitQdrant,CreateCollection,Recreate,UpsertBatch,DeletePoints,SaveCache,MarkComplete storage
```

---

## State Diagram -- Index Mode Lifecycle

How the three indexing modes (`disabled`, `query`, `background`) behave.

```mermaid
stateDiagram-v2
    [*] --> ConfigLoaded: loadIndexConfig()

    ConfigLoaded --> Disabled: mode = disabled
    ConfigLoaded --> QueryMode: mode = query
    ConfigLoaded --> BackgroundMode: mode = background

    state Disabled {
        [*] --> CheckExisting
        CheckExisting --> SearchOnly: collection exists
        CheckExisting --> NoResults: no collection
        SearchOnly --> [*]
        NoResults --> [*]
    }

    state QueryMode {
        [*] --> SyncIndex
        SyncIndex --> IndexFresh: ensureIndexFresh()
        IndexFresh --> RunSearch: searchIndex()
        RunSearch --> Rerank: rerankSearchResults()
        Rerank --> [*]
    }

    state BackgroundMode {
        [*] --> ScheduleRefresh
        ScheduleRefresh --> SearchImmediate: return immediately
        SearchImmediate --> RerankBG: rerankSearchResults()
        RerankBG --> [*]

        state ScheduleRefresh {
            [*] --> Debounce
            Debounce --> RunIndex: after 100-1500ms
            RunIndex --> Complete
        }
    }
```

---

## Configuration Resolution

How settings are resolved across three tiers.

```mermaid
flowchart LR
    subgraph Tier1["Tier 1: Environment Variables"]
        direction TB
        E1["CODEBASE_SEARCH_PROVIDER"]
        E2["CODEBASE_SEARCH_MODEL"]
        E3["CODEBASE_SEARCH_QDRANT_URL"]
        E4["OPENAI_API_KEY"]
        E5["CODEBASE_SEARCH_INDEX_MODE"]
    end

    subgraph Tier2["Tier 2: JSONC Settings File"]
        direction TB
        S1["worktree/.opencode/\ncodebase-search.settings.jsonc"]
        S2["~/.config/opencode/\ncodebase-search.settings.jsonc"]
        S1 -->|fallback| S2
    end

    subgraph Tier3["Tier 3: Hardcoded Defaults"]
        direction TB
        D1["provider: openai"]
        D2["model: text-embedding-3-large"]
        D3["qdrantUrl: localhost:6333"]
        D4["indexMode: disabled"]
    end

    Tier1 -->|highest priority| Resolve
    Tier2 -->|middle priority| Resolve
    Tier3 -->|lowest priority| Resolve
    Resolve[Resolved IndexConfig] --> Tool[codebase_search]

    classDef tier1 fill:#FFB6C1,stroke:#DC143C,stroke-width:2px,color:#000
    classDef tier2 fill:#FFE4B5,stroke:#D2691E,stroke-width:2px,color:#000
    classDef tier3 fill:#D3D3D3,stroke:#696969,stroke-width:2px,color:#000
    classDef resolve fill:#90EE90,stroke:#2E8B57,stroke-width:2px,color:darkgreen

    class E1,E2,E3,E4,E5 tier1
    class S1,S2 tier2
    class D1,D2,D3,D4 tier3
    class Resolve,Tool resolve
```

---

## Source vs Runtime Layout

```mermaid
graph LR
    subgraph Source["src/ -- Canonical Source"]
        direction TB
        SrcTools["tools/codebase_search.ts\ntools/codebase-search/**"]
        SrcPlugins["plugins/codebase-index-worker.ts"]
        SrcTests["**/__tests__/**"]
    end

    subgraph Generated[".opencode/ -- Generated Runtime"]
        direction TB
        GenTools["tools/codebase_search.ts\ntools/codebase-search/**"]
        GenPlugins["plugins/codebase-index-worker.ts"]
        GenPkg["package.json"]
    end

    subgraph Dist["dist/ -- Release Tarball"]
        direction TB
        DistTools["tools/**"]
        DistPlugins["plugins/**"]
        DistDocs["README.md, CHANGELOG.md"]
    end

    Source -->|"npm run sync:opencode\n(excludes __tests__)"| Generated
    Source -->|"npm run build:release\n(excludes plans, fixtures)"| Dist

    classDef src fill:#90EE90,stroke:#2E8B57,stroke-width:2px,color:darkgreen
    classDef gen fill:#87CEEB,stroke:#4682B4,stroke-width:2px,color:darkblue
    classDef dist fill:#E6E6FA,stroke:#6A5ACD,stroke-width:2px,color:darkblue

    class SrcTools,SrcPlugins,SrcTests src
    class GenTools,GenPlugins,GenPkg gen
    class DistTools,DistPlugins,DistDocs dist
```

---

## Runtime components

- `src/tools/codebase_search.ts`
  - OpenCode tool contract and argument validation
  - delegates execution to engine

- `src/tools/codebase-search/engine.ts`
  - top-level mode orchestration (`disabled`, `query`, `background`)
  - provider/config initialization
  - result formatting and reranking application

- `src/tools/codebase-search/indexer.ts`
  - incremental/full indexing flow
  - cache reconciliation and adoption logic
  - file scanning + parsing + embedding + upsert

- `src/tools/codebase-search/parser.ts`
  - tree-sitter and fallback chunking

- `src/tools/codebase-search/qdrant.ts`
  - collection management and vector operations
  - dimension mismatch recreate behavior

- `src/plugins/codebase-index-worker.ts`
  - background trigger wiring from OpenCode events

## Source vs runtime layout

- Canonical editable source: `src/`
- Generated runtime payload: `.opencode/` (created by `npm run sync:opencode`)

Generated runtime folder is intentionally not the source of truth.

## Distribution boundaries

Release assets include only runtime-required payload and top-level docs/templates.

Development-only artifacts remain in-repo but out-of-asset:

- `docs/plans/`
- fixture projects
- test evidence logs
