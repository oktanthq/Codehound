#!/usr/bin/env node
import { startWebhookServerFromEnv } from "./server/webhooks.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== "serve") {
    console.error("Usage: codehound serve");
    process.exitCode = 1;
    return;
  }

  const started = await startWebhookServerFromEnv();
  const shutdown = () => {
    void started.close().then(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(
    `Codehound webhook server listening on http://127.0.0.1:${started.port}/webhooks/github`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Failed to start webhook server";
  console.error(message);
  process.exitCode = 1;
});
