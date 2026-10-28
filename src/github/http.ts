export type HttpRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type HttpClient = {
  request: (req: HttpRequest) => Promise<HttpResponse>;
};

export function createFetchHttpClient(fetchImpl: typeof fetch = fetch): HttpClient {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const init: RequestInit = { method: req.method };
      if (req.headers !== undefined) {
        init.headers = req.headers;
      }
      if (req.body !== undefined) {
        init.body = req.body;
      }
      const res = await fetchImpl(req.url, init);
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return {
        status: res.status,
        headers,
        body: await res.text(),
      };
    },
  };
}
