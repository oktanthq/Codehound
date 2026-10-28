import type { AnalysisContext, AnalysisDocument, AnalysisFile } from "./types.js";

export type LanguageAdapter = {
  readonly id: string;
  readonly languages: readonly string[];
  analyze: (file: AnalysisFile, context: AnalysisContext) => Promise<AnalysisDocument>;
};

export class AdapterRegistry {
  private readonly adapters: LanguageAdapter[] = [];

  register(adapter: LanguageAdapter): this {
    this.adapters.push(adapter);
    return this;
  }

  adapterFor(language: string | undefined): LanguageAdapter | undefined {
    if (language === undefined) {
      return undefined;
    }
    return this.adapters.find((adapter) => adapter.languages.includes(language));
  }

  list(): readonly LanguageAdapter[] {
    return this.adapters;
  }
}
