import type { LanguageAdapter } from "./adapter.js";
import { AdapterRegistry } from "./adapter.js";
import type {
  AnalysisContext,
  AnalysisDocument,
  AnalysisFile,
  AnalysisRun,
  SkippedFile,
} from "./types.js";

export type AnalysisPipelineOptions = {
  registry?: AdapterRegistry;
};

export class AnalysisPipeline {
  private readonly registry: AdapterRegistry;

  constructor(options: AnalysisPipelineOptions = {}) {
    this.registry = options.registry ?? new AdapterRegistry();
  }

  register(adapter: LanguageAdapter): this {
    this.registry.register(adapter);
    return this;
  }

  async analyze(context: AnalysisContext, files: readonly AnalysisFile[]): Promise<AnalysisRun> {
    const documents: AnalysisDocument[] = [];
    const skipped: SkippedFile[] = [];

    for (const file of files) {
      if (file.language === undefined) {
        skipped.push({
          path: file.path,
          language: undefined,
          reason: "undetected-language",
          message: undefined,
        });
        continue;
      }
      const adapter = this.registry.adapterFor(file.language);
      if (adapter === undefined) {
        skipped.push({
          path: file.path,
          language: file.language,
          reason: "unsupported-language",
          message: `no adapter registered for ${file.language}`,
        });
        continue;
      }
      try {
        documents.push(await adapter.analyze(file, context));
      } catch (error) {
        const message = error instanceof Error ? error.message : "adapter failed";
        skipped.push({
          path: file.path,
          language: file.language,
          reason: "adapter-failed",
          message,
        });
      }
    }

    return { context, documents, skipped };
  }
}
