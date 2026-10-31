import { strict as assert } from "node:assert";
import { test } from "node:test";
import { encryptProviderCredentials, decryptProviderCredentials, encryptHiggsfieldMcpTokens, decryptHiggsfieldMcpTokens, encryptHiggsfieldMcpVerifier, decryptHiggsfieldMcpVerifier, createGenerationQuoteToken, verifyGenerationQuoteToken, generationQuoteHash } from "../lib/provider-vault.ts";

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

test("MCP tokens and OAuth verifier are encrypted and bound to one user and purpose", () => {
  process.env.HIGGSFIELD_VAULT_KEY = Buffer.alloc(32, 2).toString("base64");
  const tokens = { accessToken: "access-value", refreshToken: "refresh-value", clientId: "client-value", expiresAt: 1234567890, scopes: ["openid", "offline_access"] };
  const encryptedTokens = encryptHiggsfieldMcpTokens("user-one",tokens);
  const encryptedVerifier = encryptHiggsfieldMcpVerifier("user-one","pkce-verifier");
  assert.equal(encryptedTokens.includes(tokens.accessToken),false);
  assert.deepEqual(decryptHiggsfieldMcpTokens("user-one",encryptedTokens),tokens);
  assert.equal(decryptHiggsfieldMcpVerifier("user-one",encryptedVerifier),"pkce-verifier");
  assert.throws(()=>decryptHiggsfieldMcpTokens("user-two",encryptedTokens));
  assert.throws(()=>decryptHiggsfieldMcpVerifier("user-one",encryptedTokens));
});

test("generation quote token binds a short-lived USD estimate to a specific user and shot", () => {
  process.env.HIGGSFIELD_VAULT_KEY = Buffer.alloc(32, 3).toString("base64");
  const claims = {
    userId: "user-one", filmId: "film-one", sceneId: "scene-one", requestKey: "request-one",
    referenceGenerationId: null, modelPath: "/bytedance/seedance-2.5/text-to-video", durationSeconds: 4,
    promptHash: generationQuoteHash("exact prompt"), credentialsHash: generationQuoteHash("encrypted user credentials"),
    estimatedUsd: 0.1234, expiresAt: Date.now() + 60_000,
  };
  const token = createGenerationQuoteToken(claims);
  assert.deepEqual(verifyGenerationQuoteToken(token), claims);
  const [body, signature] = token.split(".");
  const changedFirstCharacter = signature[0] === "A" ? "B" : "A";
  assert.throws(() => verifyGenerationQuoteToken(`${body}.${changedFirstCharacter}${signature.slice(1)}`));
  assert.throws(() => verifyGenerationQuoteToken(createGenerationQuoteToken({ ...claims, expiresAt: Date.now() - 1 })));
});
