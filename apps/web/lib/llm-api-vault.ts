import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function vaultKey() {
  const raw = process.env.LLM_VAULT_KEY || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error("Set LLM_VAULT_KEY to a base64-encoded 32-byte secret");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) throw new Error("Invalid LLM vault key");
  return key;
}

export function llmVaultReady() {
  try { vaultKey(); return true; } catch { return false; }
}

function aad(userId: string, provider: string) {
  return Buffer.from(`cinemesh:llm-api:${provider}:${userId}`);
}

export function encryptLlmApiKey(userId: string, provider: string, apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(aad(userId, provider));
  const data = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptLlmApiKey(userId: string, provider: string, encoded: string) {
  const [version, nonce, tag, data, extra] = encoded.split(":");
  if (version !== "v1" || !nonce || !tag || !data || extra !== undefined) throw new Error("Invalid encrypted LLM credential");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(nonce, "base64"));
  decipher.setAAD(aad(userId, provider));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
