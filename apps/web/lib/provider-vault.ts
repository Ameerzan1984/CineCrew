import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// A 32-byte, base64-encoded server secret; rotation needs re-encryption, not silent replacement.
function vaultKey(): Buffer {
  const raw = process.env.HIGGSFIELD_VAULT_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error("HIGGSFIELD_VAULT_KEY must be a base64-encoded 32-byte key");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) throw new Error("Invalid vault key");
  return key;
}
export function encryptProviderCredentials(userId: string, credentials: { keyId: string; keySecret: string }): string {
  return encryptScopedValue(userId, "higgsfield-api", credentials);
}
export function decryptProviderCredentials(userId: string, ciphertext: string): { keyId: string; keySecret: string } {
  const result = decryptScopedValue(userId, "higgsfield-api", ciphertext);
  if (typeof result.keyId !== "string" || typeof result.keySecret !== "string") throw new Error("Invalid encrypted credential");
  return { keyId: result.keyId, keySecret: result.keySecret };
}

type HiggsfieldMcpTokens = { accessToken: string; refreshToken: string | null; clientId: string; expiresAt: number | null; scopes: string[] };
export function encryptHiggsfieldMcpTokens(userId: string, tokens: HiggsfieldMcpTokens): string {
  return encryptScopedValue(userId, "higgsfield-mcp", tokens);
}
export function decryptHiggsfieldMcpTokens(userId: string, ciphertext: string): HiggsfieldMcpTokens {
  const value = decryptScopedValue(userId, "higgsfield-mcp", ciphertext);
  if (typeof value.accessToken !== "string" || typeof value.clientId !== "string" ||
      !(value.refreshToken === null || typeof value.refreshToken === "string") ||
      !(value.expiresAt === null || typeof value.expiresAt === "number") ||
      !Array.isArray(value.scopes) || !value.scopes.every(scope => typeof scope === "string")) {
    throw new Error("Invalid encrypted MCP token");
  }
  return value as HiggsfieldMcpTokens;
}

export function encryptHiggsfieldMcpVerifier(userId: string, verifier: string): string {
  return encryptScopedValue(userId, "higgsfield-mcp-oauth-state", { verifier });
}
export function decryptHiggsfieldMcpVerifier(userId: string, ciphertext: string): string {
  const value = decryptScopedValue(userId, "higgsfield-mcp-oauth-state", ciphertext);
  if (typeof value.verifier !== "string") throw new Error("Invalid encrypted OAuth verifier");
  return value.verifier;
}

function encryptScopedValue(userId: string, purpose: string, value: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(Buffer.from(`cinemesh:${purpose}:${userId}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

function decryptScopedValue(userId: string, purpose: string, ciphertext: string): Record<string, unknown> {
  const [version, nonce, tag, data, extra] = ciphertext.split(":");
  if (version !== "v1" || !nonce || !tag || !data || extra !== undefined) throw new Error("Invalid encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(nonce, "base64"));
  decipher.setAAD(Buffer.from(`cinemesh:${purpose}:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const result = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8"));
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid encrypted credential");
  return result;
}
