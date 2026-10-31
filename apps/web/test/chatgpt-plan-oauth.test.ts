import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildAuthorizationUrl, callbackClientId, exchangeAuthorizationCode, hasChatGPTPlanScopes, refreshChatGPTTokens, validateChatGPTRedirectUri, type OAuthTransaction } from "../lib/chatgpt-plan-oauth.ts";

const redirectUri = "http://127.0.0.1:3000/api/connections/chatgpt/callback";
const planScopes = ["openid", "profile", "email", "offline_access", "resource.invoke", "chatgpt.tokens.use.direct"];

test("ChatGPT authorization uses the exact local callback and required plan scopes with fresh PKCE", () => {
  const url = new URL(buildAuthorizationUrl({
    state: "state-value", hostId: "urn:uuid:01234567-89ab-4def-8123-456789abcdef", registration: true,
    transaction: { nonce: "nonce-value", verifier: "test-verifier", clientId: "dynamic_agent_client", redirectUri, createdAt: Date.now() },
  }));
  assert.equal(url.origin + url.pathname, "https://auth.openai.com/api/accounts/authorize");
  assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
  assert.equal(url.searchParams.get("scope"), "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct");
  assert.equal(url.searchParams.get("agent_name_hint"), "CineMesh");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.equal(validateChatGPTRedirectUri(redirectUri), redirectUri);
});

test("redirect validation rejects localhost, wrong ports, and callback path mismatches", () => {
  assert.throws(() => validateChatGPTRedirectUri("http://localhost:3000/api/connections/chatgpt/callback"));
  assert.throws(() => validateChatGPTRedirectUri("http://127.0.0.1:54321/api/connections/chatgpt/callback"));
  assert.throws(() => validateChatGPTRedirectUri("http://127.0.0.1:3000/callback"));
  assert.throws(() => validateChatGPTRedirectUri("https://127.0.0.1:3000/api/connections/chatgpt/callback"));
});

test("authorization-code exchange repeats the exact callback URI and resource", async () => {
  const originalFetch = globalThis.fetch;
  const transaction: OAuthTransaction = { nonce: "nonce-value", verifier: "pkce-verifier", clientId: "oaiapp-issued-client", redirectUri, createdAt: Date.now() };
  let captured: { url: string; options: RequestInit } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, options: RequestInit = {}) => {
    captured = { url: String(url), options };
    return Response.json({ access_token: "access", refresh_token: "refresh", id_token: "id-token", expires_in: 3600, scope: "openid offline_access" });
  }) as typeof fetch;
  try {
    await assert.rejects(exchangeAuthorizationCode("one-time-code", transaction, "oaiapp-issued-client"), /required ChatGPT plan usage scopes/i);
    assert.equal(captured?.url, "https://auth.openai.com/api/accounts/oauth/token");
    const body = new URLSearchParams(String(captured?.options.body));
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("client_id"), "oaiapp-issued-client");
    assert.equal(body.get("redirect_uri"), redirectUri);
    assert.equal(body.get("code_verifier"), "pkce-verifier");
    assert.equal(body.get("resource"), "https://api.openai.com/v1");
  } finally { globalThis.fetch = originalFetch; }
});

test("dynamic registration retains the issued client ID and reauthorization rejects client switching", () => {
  assert.equal(callbackClientId("oaiapp_issued-client", "dynamic_agent_client"), "oaiapp_issued-client");
  assert.equal(callbackClientId(null, "oaiapp_saved-client"), "oaiapp_saved-client");
  assert.throws(() => callbackClientId("oaiapp_other-client", "oaiapp_saved-client"));
  assert.equal(hasChatGPTPlanScopes(planScopes), true);
  assert.equal(hasChatGPTPlanScopes(planScopes.filter(scope => scope !== "resource.invoke")), false);
});

test("refresh sends the issued client, resource, and rotating refresh token, and requires retained scopes", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; options: RequestInit } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, options: RequestInit = {}) => {
    captured = { url: String(url), options };
    return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: planScopes.join(" ") });
  }) as typeof fetch;
  try {
    const result = await refreshChatGPTTokens("oaiapp-issued-client", "old-refresh");
    assert.equal(captured?.url, "https://auth.openai.com/api/accounts/oauth/token");
    const body = new URLSearchParams(String(captured?.options.body));
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("client_id"), "oaiapp-issued-client");
    assert.equal(body.get("refresh_token"), "old-refresh");
    assert.equal(body.get("resource"), "https://api.openai.com/v1");
    assert.equal(body.has("scope"), false);
    assert.equal(result.refresh_token, "new-refresh");
    assert.deepEqual(result.scopes, planScopes);
  } finally { globalThis.fetch = originalFetch; }
});

test("refresh rejects missing plan scopes and invalid lifetimes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: "offline_access" })) as typeof fetch;
    await assert.rejects(refreshChatGPTTokens("oaiapp-issued-client", "old-refresh"), /required plan usage scopes/i);
    globalThis.fetch = (async () => Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 0, scope: planScopes.join(" ") })) as typeof fetch;
    await assert.rejects(refreshChatGPTTokens("oaiapp-issued-client", "old-refresh"), /invalid refreshed credential set/i);
  } finally { globalThis.fetch = originalFetch; }
});
