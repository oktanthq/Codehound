import { AnalysisPipeline } from "./pipeline.js";
import { TypeScriptLanguageAdapter } from "./typescript-adapter.js";

export function createDefaultAnalysisPipeline(): AnalysisPipeline {
  return new AnalysisPipeline().register(new TypeScriptLanguageAdapter());
}
