import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function vaultKey(): Buffer {
  const raw = process.env.CHATGPT_VAULT_KEY || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error("Set CHATGPT_VAULT_KEY to a base64-encoded 32-byte secret");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) throw new Error("Invalid ChatGPT vault key");
  return key;
}

function aad(userId: string, purpose: "credentials" | "oauth-transaction") {
  return Buffer.from(`cinemesh:chatgpt-plan:${purpose}:${userId}`);
}

export function encryptChatGPTSecret(userId: string, value: unknown, purpose: "credentials" | "oauth-transaction" = "credentials"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(aad(userId, purpose));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptChatGPTSecret<T>(userId: string, encoded: string, purpose: "credentials" | "oauth-transaction" = "credentials"): T {
  const [version, nonce, tag, data, extra] = encoded.split(":");
  if (version !== "v1" || !nonce || !tag || !data || extra !== undefined) throw new Error("Invalid encrypted ChatGPT credential");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(nonce, "base64"));
  decipher.setAAD(aad(userId, purpose));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const clear = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(clear) as T;
}
