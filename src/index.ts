export const name = "codehound";
export const version = "0.1.0";

export {
  GitHubApp,
  GitHubAppError,
  RepositoryAuthorizer,
  RepositoryDiscovery,
  RepositoryIngestor,
  IncrementalIngestor,
  InMemorySelectionStore,
  BranchTracker,
  InMemoryRefStore,
  WebhookHandler,
  loadGitHubAppConfig,
  createGitHubAppJwt,
  InstallationTokenClient,
  detectFile,
  summarizeLanguages,
  InMemoryMetadataStore,
  RetryingIngestor,
  RetryingIncrementalIngestor,
  InMemoryIngestJobStore,
} from "./github/index.js";

export {
  AdapterRegistry,
  AnalysisPipeline,
  InMemoryAnalysisStore,
  TypeScriptLanguageAdapter,
  analysisFilesFromIngest,
  createDefaultAnalysisPipeline,
  loadAnalysisContents,
  detectFrameworks,
  isTargetLanguage,
  TARGET_LANGUAGES,
} from "./analysis/index.js";

export {
  chunkDocument,
  chunkSource,
  EmbeddingPipeline,
  HashingEmbedder,
  HybridRetriever,
  InMemoryVectorStore,
  IncrementalIndexer,
  KeywordIndex,
  SemanticSearcher,
  SymbolAwareRetriever,
  FilteringRetriever,
  RerankingRetriever,
  evaluateRetriever,
} from "./rag/index.js";

export {
  CodeIntelligenceModel,
  CimQueryLayer,
  InMemoryCimStore,
  ingestAnalysisRun,
  persistNewVersion,
} from "./cim/index.js";

export {
  IntelligenceHost,
  McpServer,
  MCP_PROTOCOL_VERSION,
  TOOL_CATALOG,
  listenStdio,
} from "./mcp/index.js";

export { InMemoryPullStore, PullRequestIngestor, analyzePullDiff, parsePatch } from "./review/index.js";
