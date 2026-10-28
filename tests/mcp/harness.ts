import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { ingestAnalysisRun } from "../../src/cim/from-analysis.js";
import { CodeIntelligenceModel } from "../../src/cim/model.js";
import { IntelligenceHost } from "../../src/mcp/host.js";
import { McpServer } from "../../src/mcp/server.js";
import {
  JSONRPC_VERSION,
  type JsonRpcRequest,
  type JsonRpcSuccess,
} from "../../src/mcp/protocol.js";
import { chunkDocument } from "../../src/rag/chunk.js";
import { EmbeddingPipeline, HashingEmbedder } from "../../src/rag/embed.js";
import { HybridRetriever } from "../../src/rag/hybrid.js";
import { KeywordIndex } from "../../src/rag/bm25.js";
import { SemanticSearcher } from "../../src/rag/semantic.js";
import { InMemoryVectorStore } from "../../src/rag/vector.js";
import type { AgentPayload } from "../../src/mcp/format.js";

export const DEMO_REPO = "oktant/demo";

export const DEMO_FILES: { path: string; content: string }[] = [
  {
    path: "src/greet.ts",
    content: "export function greet(name: string) { return name; }\n",
  },
  {
    path: "src/index.ts",
    content:
      'import { greet } from "./greet.js";\nexport function validateName(name: string) { return greet(name); }\n',
  },
  {
    path: "src/users.service.ts",
    content: `@Injectable()\nexport class UsersService {\n  find() { return []; }\n}\n`,
  },
  {
    path: "src/users.controller.ts",
    content: `import { UsersService } from "./users.service.js";
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list() { return this.users.find(); }
}
`,
  },
  {
    path: "tests/greet.test.ts",
    content: 'import { greet } from "../src/greet.js";\nexport const sample = greet("x");\n',
  },
];

export async function createDemoServer(
  files: { path: string; content: string }[] = DEMO_FILES,
): Promise<{ server: McpServer; host: IntelligenceHost }> {
  const run = await createDefaultAnalysisPipeline().analyze(
    { repositoryFullName: DEMO_REPO, commitSha: "abc", ref: "main" },
    files.map((file) => ({
      path: file.path,
      language: "TypeScript",
      kind: "source" as const,
      content: file.content,
    })),
  );
  const model = new CodeIntelligenceModel();
  ingestAnalysisRun(model, run);
  const chunks = run.documents.flatMap((document) => {
    const content = files.find((file) => file.path === document.path)?.content ?? "";
    return chunkDocument(document, content, run.context);
  });
  const keywords = new KeywordIndex();
  keywords.add(chunks);
  const semantic = new SemanticSearcher(
    new EmbeddingPipeline(new HashingEmbedder(48)),
    new InMemoryVectorStore(),
  );
  await semantic.index(chunks);
  const host = new IntelligenceHost({ retriever: new HybridRetriever(semantic, keywords) });
  host.register({
    fullName: DEMO_REPO,
    commitSha: run.context.commitSha,
    ref: run.context.ref,
    model,
    files: new Map(files.map((file) => [file.path, file.content])),
  });
  return { host, server: new McpServer({ host }) };
}

export function request(method: string, params?: unknown, id: number | string = 1): JsonRpcRequest {
  const message: JsonRpcRequest = { jsonrpc: JSONRPC_VERSION, id, method };
  if (params !== undefined) {
    message.params = params;
  }
  return message;
}

export async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown> = {},
): Promise<AgentPayload> {
  const response = await server.handle(request("tools/call", { name, arguments: args }));
  if (response === undefined || "error" in response) {
    throw new Error(`tool ${name} failed: ${JSON.stringify(response)}`);
  }
  const result = (response as JsonRpcSuccess).result as {
    structuredContent?: AgentPayload;
    isError?: boolean;
  };
  const payload = result.structuredContent;
  if (payload === undefined) {
    throw new Error(`tool ${name} returned no structured content`);
  }
  if (result.isError === true) {
    throw new Error(payload.summary);
  }
  return payload;
}
