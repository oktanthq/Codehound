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

GitHub Integration is complete (OKT-21 through OKT-31). OKT-30 is archived and duplicates OKT-31, so it was not implemented separately.

Code Analysis Engine is complete (OKT-32 through OKT-43).

Code RAG & Retrieval Engine is complete (OKT-44 through OKT-54). Embeddings use a local hashing embedder (`Embedder` / `HashingEmbedder`) and vectors live in `InMemoryVectorStore`; swap those interfaces for a hosted embedding API or vector database when credentials exist.

Code Intelligence Model is complete (OKT-55 through OKT-68). Persistence is `CimStore` / `InMemoryCimStore`. No archived duplicates were skipped in OKT-44 through OKT-68.

MCP Project Intelligence Server is complete (OKT-69 through OKT-80). The server is a local JSON-RPC implementation (`McpServer`, stdio framing). Retrieval still uses the hashing embedder and in-memory vector store. No archived duplicates were skipped in OKT-69 through OKT-80.

Intelligent PR Review is started (OKT-81 through OKT-84). Remaining review issues begin at OKT-85. GitHub HTTP is mocked in tests; no live GitHub credentials are required.

## Partial

None for the MCP milestone. Intelligent PR Review continues at OKT-85.

## Next

- OKT-85 Implement code smell detection
