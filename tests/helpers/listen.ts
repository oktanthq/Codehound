import type { Server } from "node:http";
import { closeServer, listenServer } from "../../src/server/webhooks.js";

export async function listenLocal(server: Server): Promise<{
  url: string;
  port: number;
  close: () => Promise<void>;
}> {
  const port = await listenServer(server, 0, "127.0.0.1");
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => closeServer(server),
  };
}
