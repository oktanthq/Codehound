import type { HttpClient, HttpRequest, HttpResponse } from "../../src/github/http.js";

export type MockRoute = {
  method: string;
  urlIncludes: string;
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  once?: boolean;
};

export class MockHttp implements HttpClient {
  readonly calls: HttpRequest[] = [];
  private readonly routes: MockRoute[] = [];

  on(route: MockRoute): this {
    this.routes.push(route);
    return this;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    this.calls.push(req);
    const index = this.routes.findIndex(
      (route) => route.method === req.method && req.url.includes(route.urlIncludes),
    );
    if (index === -1) {
      return {
        status: 404,
        headers: {},
        body: JSON.stringify({ message: `No mock for ${req.method} ${req.url}` }),
      };
    }
    const route = this.routes[index];
    if (route === undefined) {
      return { status: 404, headers: {}, body: JSON.stringify({ message: "missing mock" }) };
    }
    if (route.once === true) {
      this.routes.splice(index, 1);
    }
    return {
      status: route.status ?? 200,
      headers: route.headers ?? { "content-type": "application/json" },
      body: typeof route.body === "string" ? route.body : JSON.stringify(route.body ?? {}),
    };
  }
}

export function bearerToken(req: HttpRequest): string | undefined {
  const header = req.headers?.authorization ?? req.headers?.Authorization;
  if (header === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}
