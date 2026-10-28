# Progress

Work happens on the `dev` branch.

## Done

- Project scaffold: TypeScript/Node.js layout, npm, Vitest, ESLint, Prettier, GitHub Actions CI.
- OKT-21 Set up GitHub App integration (env config, RS256 JWT, installation access tokens)
- OKT-22 Implement repository authentication and authorization
- OKT-23 Implement repository discovery and selection
- OKT-24 Implement repository cloning/ingestion
- OKT-25 Implement branch and commit tracking
- OKT-26 Implement GitHub webhook handling
- OKT-27 Implement incremental code ingestion
- OKT-28 Implement file and language detection
- OKT-29 Implement repository/version metadata storage
- OKT-31 Implement ingestion failure handling and retry mechanism
- OKT-32 Design language-agnostic code analysis architecture
- OKT-33 Implement AST parsing pipeline
- OKT-34 Implement symbol extraction
- OKT-35 Implement import and dependency extraction
- OKT-36 Implement call graph extraction
- OKT-37 Implement type/class relationship extraction
- OKT-38 Implement API and endpoint extraction
- OKT-39 Implement data-flow analysis
- OKT-40 Implement component/module detection
- OKT-41 Implement cross-file relationship analysis
- OKT-42 Implement analysis result storage
- OKT-43 Add support for initial target languages/frameworks
- OKT-44 Design code-aware chunking strategy
- OKT-45 Implement code/document embedding pipeline
- OKT-46 Set up vector storage
- OKT-47 Implement semantic search
- OKT-48 Implement BM25/keyword search
- OKT-49 Implement hybrid retrieval
- OKT-50 Implement symbol-aware retrieval
- OKT-51 Implement metadata and repository filtering
- OKT-52 Implement retrieval ranking/reranking
- OKT-53 Implement incremental index updates
- OKT-54 Build retrieval evaluation dataset and benchmarks
- OKT-55 Define CIM architecture and data model
- OKT-56 Design Codehound ontology
- OKT-57 Define core entities and relationships
- OKT-58 Implement dependency graph
- OKT-59 Implement call graph model
- OKT-60 Implement component relationship model
- OKT-61 Implement architecture model
- OKT-62 Implement workflow/data-flow model
- OKT-63 Implement business-rule extraction
- OKT-64 Implement code-to-business-rule relationships
- OKT-65 Implement persistent CIM storage
- OKT-66 Implement incremental CIM updates
- OKT-67 Implement CIM versioning
- OKT-68 Implement CIM query layer
- OKT-69 Design Codehound MCP interface
- OKT-70 Implement MCP server
- OKT-71 Implement project discovery tools
- OKT-72 Implement code/context retrieval tools
- OKT-73 Implement dependency graph queries
- OKT-74 Implement call graph queries
- OKT-75 Implement component/architecture queries
- OKT-76 Implement business-rule queries
- OKT-77 Implement impact-analysis queries
- OKT-78 Implement RAG + CIM context composition
- OKT-79 Implement agent-oriented response formatting
- OKT-80 Test MCP compatibility with target coding agents
- OKT-81 Implement PR ingestion and synchronization
- OKT-82 Implement diff analysis
- OKT-83 Implement changed-code context retrieval
- OKT-84 Implement CIM-based impact analysis
- OKT-85 Implement code smell detection
- OKT-86 Implement bad-practice detection
- OKT-87 Implement architecture violation detection
- OKT-88 Implement business-rule violation detection
- OKT-89 Implement regression-risk analysis
- OKT-90 Implement security-risk detection
- OKT-91 Implement automated review comments
- OKT-92 Implement PR summary generation
- OKT-93 Implement review severity classification
- OKT-94 Integrate Codehound review with GitHub PRs
- OKT-95 Design context-aware change generation pipeline
- OKT-96 Implement issue-to-code context mapping
- OKT-97 Implement single-file code suggestions
- OKT-98 Implement multi-file code changes
- OKT-99 Implement dependency-aware modifications
- OKT-100 Implement architecture-aware modifications
- OKT-101 Implement business-rule preservation checks
- OKT-102 Implement patch/diff generation
- OKT-103 Implement test generation/update suggestions
- OKT-104 Implement change impact analysis
- OKT-105 Implement generated-change validation
- OKT-106 Integrate remediation suggestions into PR review
- OKT-107 Design Codehound security analysis architecture
- OKT-108 Implement SAST rules engine
- OKT-109 Implement dependency vulnerability scanning
- OKT-110 Implement secret and sensitive-data detection
- OKT-111 Implement authentication/authorization analysis
- OKT-112 Implement data-flow security analysis
- OKT-113 Implement injection-path detection
- OKT-114 Implement insecure API usage detection
- OKT-115 Implement security business-rule analysis
- OKT-116 Implement cross-component vulnerability tracing
- OKT-117 Implement vulnerability severity classification
- OKT-118 Implement vulnerability remediation suggestions
- OKT-119 Integrate security findings into PR reviews
- OKT-120 Build security-analysis evaluation benchmarks

GitHub Integration is complete (OKT-21 through OKT-31). OKT-30 is archived and duplicates OKT-31, so it was not implemented separately.

Code Analysis Engine is complete (OKT-32 through OKT-43).

Code RAG & Retrieval Engine is complete (OKT-44 through OKT-54). Embeddings use a local hashing embedder (`Embedder` / `HashingEmbedder`) and vectors live in `InMemoryVectorStore`; swap those interfaces for a hosted embedding API or vector database when credentials exist.

Code Intelligence Model is complete (OKT-55 through OKT-68). Persistence is `CimStore` / `InMemoryCimStore`. No archived duplicates were skipped in OKT-44 through OKT-68.

MCP Project Intelligence Server is complete (OKT-69 through OKT-80). The server is a local JSON-RPC implementation (`McpServer`, stdio framing). Retrieval still uses the hashing embedder and in-memory vector store. No archived duplicates were skipped in OKT-69 through OKT-80.

Intelligent PR Review is complete (OKT-81 through OKT-94). Detectors and GitHub review publishing use mocked HTTP; no live GitHub credentials are required.

Intelligent Code-Change Suggestions is complete (OKT-95 through OKT-106). Edits are local rewrites behind `generateSuggestions`; there is no hosted generation API. No archived duplicates were skipped in OKT-85 through OKT-106.

Vulnerability Assessment is complete (OKT-107 through OKT-120). Dependency advisories use `AdvisoryDatabase` / `LocalAdvisoryDatabase` (curated npm ranges). SAST, taint, secrets, and remediations are local. No archived duplicates were skipped in OKT-107 through OKT-120.

## Partial

None.

## Next

Linear milestones through Vulnerability Assessment are implemented. Remaining work is swapping local interfaces for hosted backends (see README).
