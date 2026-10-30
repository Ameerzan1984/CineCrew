import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildHiggsfieldMcpAuthorizationUrl, discoverHiggsfieldMcpOAuth, exchangeHiggsfieldMcpCode, refreshHiggsfieldMcpToken, registerHiggsfieldMcpClient, type HiggsfieldMcpOAuthMetadata } from "../lib/higgsfield-mcp-oauth.ts";

const metadata: HiggsfieldMcpOAuthMetadata = {
  issuer: "https://clerk.higgsfield.ai",
  authorization_endpoint: "https://clerk.higgsfield.ai/oauth/authorize",
  token_endpoint: "https://clerk.higgsfield.ai/oauth/token",
  registration_endpoint: "https://clerk.higgsfield.ai/oauth/register",
  revocation_endpoint: "https://clerk.higgsfield.ai/oauth/token/revoke",
  response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"],
  scopes_supported: ["openid", "email", "offline_access"],
};

test("MCP OAuth discovery pins the official resource and authorization server", async () => {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    return new Response(JSON.stringify(url.includes("oauth-protected-resource")
      ? { resource:"https://mcp.higgsfield.ai/mcp",authorization_servers:["https://clerk.higgsfield.ai"],scopes_supported:["openid","email","offline_access"] }
      : metadata),{status:200,headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  const found = await discoverHiggsfieldMcpOAuth(fetcher);
  assert.equal(found.issuer,metadata.issuer);
  assert.equal(calls.length,2);
  await assert.rejects(()=>discoverHiggsfieldMcpOAuth((async()=>new Response(JSON.stringify({
    resource:"https://mcp.higgsfield.ai/mcp",authorization_servers:["https://attacker.example"],
  }),{status:200})) as typeof fetch));
});

test("MCP authorization request pins Higgsfield resource and S256 PKCE", () => {
  const state = "state-value-with-enough-entropy-12345678901234567890";
  const verifier = "a-random-pkce-verifier-that-is-not-the-state-value";
  const authorization = new URL(buildHiggsfieldMcpAuthorizationUrl(metadata,"client-123","https://cinemesh.example/api/connections/higgsfield-mcp/callback",state,verifier));
  assert.equal(authorization.origin,"https://clerk.higgsfield.ai");
  assert.equal(authorization.searchParams.get("state"),state);
  assert.equal(authorization.searchParams.get("client_id"),"client-123");
  assert.equal(authorization.searchParams.get("resource"),"https://mcp.higgsfield.ai/mcp");
  assert.equal(authorization.searchParams.get("code_challenge_method"),"S256");
  assert.equal(authorization.searchParams.get("code_challenge"),createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(authorization.searchParams.has("code_verifier"),false);
});

test("MCP OAuth registers only a public client for the expected callback", async () => {
  const originalFetch = globalThis.fetch;
  let registration: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    registration = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ client_id: "client-123" }),{status:201,headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  try {
    const client = await registerHiggsfieldMcpClient(metadata,"https://cinemesh.example/api/connections/higgsfield-mcp/callback");
    assert.deepEqual(client,{clientId:"client-123"});
    assert.deepEqual(registration?.redirect_uris,["https://cinemesh.example/api/connections/higgsfield-mcp/callback"]);
    assert.equal(registration?.token_endpoint_auth_method,"none");
    assert.equal(registration?.scope,"openid email offline_access");
    await assert.rejects(()=>registerHiggsfieldMcpClient(metadata,"http://attacker.example/api/connections/higgsfield-mcp/callback"));
  } finally { globalThis.fetch=originalFetch; }
});

test("MCP OAuth code exchange keeps tokens server-side and normalizes expirations", async () => {
  const originalFetch = globalThis.fetch;
  let form: URLSearchParams | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    form = new URLSearchParams(String(init?.body));
    return new Response(JSON.stringify({ access_token:"access-secret",refresh_token:"refresh-secret",token_type:"Bearer",expires_in:3600,scope:"openid email offline_access" }),{status:200,headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  try {
    const token = await exchangeHiggsfieldMcpCode(metadata,"client-123","https://cinemesh.example/api/connections/higgsfield-mcp/callback","auth-code","pkce-verifier");
    assert.equal(token.accessToken,"access-secret");
    assert.equal(token.refreshToken,"refresh-secret");
    assert.ok(token.expiresAt && token.expiresAt > Date.now());
    assert.equal(form?.get("code_verifier"),"pkce-verifier");
    assert.equal(form?.get("resource"),"https://mcp.higgsfield.ai/mcp");
  } finally { globalThis.fetch=originalFetch; }
});

test("MCP OAuth refresh retains the old refresh token if rotation is omitted", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ access_token:"next-access",token_type:"Bearer",expires_in:1800 }),{status:200,headers:{"Content-Type":"application/json"}})) as typeof fetch;
  try {
    const next = await refreshHiggsfieldMcpToken(metadata,{accessToken:"old-access",refreshToken:"long-lived-refresh",clientId:"client-123",expiresAt:Date.now()-1,scopes:["openid"]});
    assert.equal(next.accessToken,"next-access");
    assert.equal(next.refreshToken,"long-lived-refresh");
    assert.ok(next.expiresAt && next.expiresAt > Date.now());
  } finally { globalThis.fetch=originalFetch; }
});
