import { createServer, type IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createFetchHttpClient } from "../../src/github/http.js";
import { listenLocal } from "../helpers/listen.js";

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("createFetchHttpClient", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) {
      const close = closers.pop();
      if (close !== undefined) {
        await close();
      }
    }
  });

  it("sends headers, query strings, and JSON bodies over the real fetch transport", async () => {
    const server = createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const body = await readBody(req);
        res.writeHead(200, {
          "content-type": "application/json",
          "x-echo-method": req.method ?? "",
        });
        res.end(
          JSON.stringify({
            path: url.pathname,
            query: Object.fromEntries(url.searchParams.entries()),
            headers: {
              "x-test": req.headers["x-test"],
              "content-type": req.headers["content-type"],
            },
            body: JSON.parse(body) as unknown,
          }),
        );
      })();
    });
    const listening = await listenLocal(server);
    closers.push(listening.close);

    const client = createFetchHttpClient();
    const response = await client.request({
      method: "POST",
      url: `${listening.url}/echo?page=2&q=hello`,
      headers: {
        "content-type": "application/json",
        "x-test": "codehound",
      },
      body: JSON.stringify({ name: "oktant" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers["x-echo-method"]).toBe("POST");
    expect(JSON.parse(response.body)).toEqual({
      path: "/echo",
      query: { page: "2", q: "hello" },
      headers: {
        "x-test": "codehound",
        "content-type": "application/json",
      },
      body: { name: "oktant" },
    });
  });

  it("returns non-2xx responses without throwing", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "unavailable" }));
    });
    const listening = await listenLocal(server);
    closers.push(listening.close);

    const client = createFetchHttpClient();
    const response = await client.request({
      method: "GET",
      url: `${listening.url}/down`,
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toEqual({ message: "unavailable" });
  });
});
