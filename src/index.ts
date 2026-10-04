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
  TypeScriptLanguageAdapter,
  analysisFilesFromIngest,
  createDefaultAnalysisPipeline,
  loadAnalysisContents,
} from "./analysis/index.js";
