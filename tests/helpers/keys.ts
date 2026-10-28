import { generateKeyPairSync } from "node:crypto";

export type TestKeyPair = {
  privateKeyPkcs8: string;
  privateKeyPkcs1: string;
  publicKey: string;
};

export function generateTestAppKeys(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyPkcs8: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    privateKeyPkcs1: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

export function testAppEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const keys = generateTestAppKeys();
  return {
    GITHUB_APP_ID: "4242",
    GITHUB_APP_PRIVATE_KEY: keys.privateKeyPkcs8,
    ...overrides,
  };
}
