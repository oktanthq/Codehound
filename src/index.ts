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
  KeywordIndex,
  SemanticSearcher,
} from "./rag/index.js";
