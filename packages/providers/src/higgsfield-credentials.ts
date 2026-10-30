import { ProviderStateError } from "./index.ts";

/** Parse the complete credential copied from Higgsfield without storing or exposing it in browser code. */
export function parseHiggsfieldApiKey(value: unknown): { keyId: string; keySecret: string } {
  if (typeof value !== "string" || value.length > 1024) {
    throw new ProviderStateError("Paste the complete Higgsfield API key.");
  }
  const key = value.trim();
  const separator = key.indexOf(":");
  if (separator < 1 || separator === key.length - 1 || /[\r\n]/.test(key) || /^key\s/i.test(key)) {
    throw new ProviderStateError("Paste the complete Higgsfield API key exactly as copied.");
  }
  const keyId = key.slice(0, separator);
  const keySecret = key.slice(separator + 1);
  if (keyId.length > 512 || keySecret.length > 512 || /[:\r\n]/.test(keyId) || /[\r\n]/.test(keySecret)) {
    throw new ProviderStateError("The Higgsfield API key format is invalid.");
  }
  return { keyId, keySecret };
}
