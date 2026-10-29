import { strict as assert } from "node:assert";
import { test } from "node:test";
import { encryptProviderCredentials, decryptProviderCredentials } from "../lib/provider-vault.ts";

test("vault encrypts, binds ciphertext to user, and detects tampering", () => {
  process.env.HIGGSFIELD_VAULT_KEY = Buffer.alloc(32, 1).toString("base64");
  const secret = { keyId: "example-id", keySecret: "example-secret" };
  const first = encryptProviderCredentials("user-one", secret);
  const second = encryptProviderCredentials("user-one", secret);
  assert.notEqual(first, second);
  assert.equal(first.includes(secret.keySecret), false);
  assert.deepEqual(decryptProviderCredentials("user-one", first), secret);
  assert.throws(() => decryptProviderCredentials("user-two", first));
  const parts = first.split(":");
  const bytes = Buffer.from(parts[3], "base64"); bytes[0] ^= 1; parts[3] = bytes.toString("base64");
  assert.throws(() => decryptProviderCredentials("user-one", parts.join(":")));
});

test("vault fails closed without a valid key", () => {
  delete process.env.HIGGSFIELD_VAULT_KEY;
  assert.throws(() => encryptProviderCredentials("user-one", { keyId: "id", keySecret: "secret" }));
  process.env.HIGGSFIELD_VAULT_KEY = Buffer.alloc(16).toString("base64");
  assert.throws(() => encryptProviderCredentials("user-one", { keyId: "id", keySecret: "secret" }));
});
