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
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(Buffer.from(`cinemesh:higgsfield-api:${userId}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}
export function decryptProviderCredentials(userId: string, ciphertext: string): { keyId: string; keySecret: string } {
  const [version, nonce, tag, data, extra] = ciphertext.split(":");
  if (version !== "v1" || !nonce || !tag || !data || extra !== undefined) throw new Error("Invalid encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(nonce, "base64"));
  decipher.setAAD(Buffer.from(`cinemesh:higgsfield-api:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const result = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8"));
  if (typeof result.keyId !== "string" || typeof result.keySecret !== "string") throw new Error("Invalid encrypted credential");
  return result;
}
