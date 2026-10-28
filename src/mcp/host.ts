import { CimQueryLayer } from "../cim/query.js";
import type { CodeIntelligenceModel } from "../cim/model.js";
import type { Retriever } from "../rag/types.js";

export type RegisteredProject = {
  fullName: string;
  commitSha: string;
  ref: string;
  model: CodeIntelligenceModel;
  files: Map<string, string>;
};

export type ProjectSummary = {
  fullName: string;
  commitSha: string;
  ref: string;
  fileCount: number;
  languages: string[];
};

export class IntelligenceHost {
  private readonly projects = new Map<string, RegisteredProject>();
  retriever: Retriever | undefined;

  constructor(options: { retriever?: Retriever } = {}) {
    this.retriever = options.retriever;
  }

  register(project: RegisteredProject): void {
    this.projects.set(project.fullName.toLowerCase(), project);
  }

  get(fullName: string): RegisteredProject | undefined {
    return this.projects.get(fullName.toLowerCase());
  }

  require(fullName: string): RegisteredProject {
    const project = this.get(fullName);
    if (project === undefined) {
      throw new Error(`Project ${fullName} is not indexed`);
    }
    return project;
  }

  list(): RegisteredProject[] {
    return [...this.projects.values()].sort((left, right) =>
      left.fullName.localeCompare(right.fullName),
    );
  }

  summaries(query: string | undefined = undefined): ProjectSummary[] {
    const needle = query?.trim().toLowerCase() ?? "";
    return this.list()
      .filter((project) => needle.length === 0 || project.fullName.toLowerCase().includes(needle))
      .map((project) => this.summarize(project));
  }

  summarize(project: RegisteredProject): ProjectSummary {
    const query = new CimQueryLayer(project.model);
    const languages = [
      ...new Set(
        query
          .byKind("file")
          .map((entity) => entity.attributes.language)
          .filter((value): value is string => typeof value === "string"),
      ),
    ].sort();
    return {
      fullName: project.fullName,
      commitSha: project.commitSha,
      ref: project.ref,
      fileCount: query.byKind("file").length,
      languages,
    };
  }

  query(fullName: string): CimQueryLayer {
    return new CimQueryLayer(this.require(fullName).model);
  }

  fileContent(fullName: string, path: string): string | undefined {
    return this.get(fullName)?.files.get(path);
  }
}
