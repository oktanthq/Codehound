export const name = "codehound";
export const version = "0.1.0";

export {
  GitHubApp,
  GitHubAppError,
  RepositoryAuthorizer,
  RepositoryDiscovery,
  RepositoryIngestor,
  InMemorySelectionStore,
  loadGitHubAppConfig,
  createGitHubAppJwt,
  InstallationTokenClient,
} from "./github/index.js";
