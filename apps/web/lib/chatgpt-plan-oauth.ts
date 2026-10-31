import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://auth.openai.com";
const authorizationEndpoint = `${issuer}/api/accounts/authorize`;
const tokenEndpoint = `${issuer}/api/accounts/oauth/token`;
const resource = "https://api.openai.com/v1";
const scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const CHATGPT_PLAN_SCOPES = ["offline_access", "resource.invoke", "chatgpt.tokens.use.direct"] as const;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const callbackPath = "/api/connections/chatgpt/callback";

export function hasChatGPTPlanScopes(granted: readonly string[]) {
  return CHATGPT_PLAN_SCOPES.every(scope => granted.includes(scope));
}

export function validateChatGPTRedirectUri(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.port !== "3000" ||
      parsed.pathname !== callbackPath || parsed.search || parsed.hash) {
    throw new Error("CHATGPT_REDIRECT_URI must use http://127.0.0.1:3000 with the CineMesh callback path");
  }
  return value;
}

export type OAuthTransaction = {
  nonce: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
  createdAt: number;
};

export type ChatGPTTokens = {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_at: number;
  scopes: string[];
};

export function opaqueValue(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function buildAuthorizationUrl(input: {
  state: string;
  transaction: OAuthTransaction;
  hostId: string;
  registration: boolean;
}) {
  const challenge = createHash("sha256").update(input.transaction.verifier).digest("base64url");
  const url = new URL(authorizationEndpoint);
  const params = new URLSearchParams({
    client_id: input.transaction.clientId,
    redirect_uri: input.transaction.redirectUri,
    response_type: "code",
    scope: scopes,
    resource,
    state: input.state,
    nonce: input.transaction.nonce,
    code_challenge_method: "S256",
    code_challenge: challenge,
    ext_agent_host_id: input.hostId,
  });
  if (input.registration) params.set("agent_name_hint", "CineMesh");
  url.search = params.toString();
  return url.toString();
}

export function callbackClientId(returned: string | null, expected: string) {
  if (expected === "dynamic_agent_client") {
    if (!returned || returned === "dynamic_agent_client" || returned.length > 255) throw new Error("ChatGPT registration did not return an issued client ID");
    return returned;
  }
  if (returned && returned !== expected) throw new Error("ChatGPT returned a different account registration");
  return expected;
}

export async function exchangeAuthorizationCode(code: string, transaction: OAuthTransaction, clientId: string) {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      code_verifier: transaction.verifier,
      redirect_uri: transaction.redirectUri,
      resource,
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ChatGPT token exchange failed (HTTP ${response.status})`);
  const result = await response.json() as Record<string, unknown>;
  const granted = typeof result.scope === "string" ? result.scope.split(/\s+/).filter(Boolean) : [];
  if (typeof result.access_token !== "string" || !result.access_token || typeof result.refresh_token !== "string" || !result.refresh_token ||
      typeof result.id_token !== "string" || !result.id_token || typeof result.expires_in !== "number" || !Number.isFinite(result.expires_in) || result.expires_in <= 0) {
    throw new Error("ChatGPT did not return the required plan-usage credentials");
  }
  if (!hasChatGPTPlanScopes(granted)) throw new Error("Required ChatGPT plan usage scopes were not granted (offline access, response invocation, and plan usage are required)");
  return {
    tokens: {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      id_token: result.id_token,
      expires_at: Date.now() + result.expires_in * 1000,
      scopes: granted,
    } satisfies ChatGPTTokens,
    identity: await verifyIdentity(result.id_token, transaction.nonce, clientId),
  };
}

export async function verifyIdentity(idToken: string, nonce: string, clientId: string) {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: clientId,
    requiredClaims: ["sub", "exp", "iat"],
    clockTolerance: 5,
  });
  if (payload.nonce !== nonce || typeof payload.sub !== "string" || !payload.sub) throw new Error("ChatGPT identity verification failed");
  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

export async function refreshChatGPTTokens(clientId: string, refreshToken: string) {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: refreshToken, resource }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ChatGPT token refresh failed (HTTP ${response.status})`);
  const result = await response.json() as Record<string, unknown>;
  if (typeof result.access_token !== "string" || !result.access_token || typeof result.refresh_token !== "string" || !result.refresh_token ||
      typeof result.expires_in !== "number" || !Number.isFinite(result.expires_in) || result.expires_in <= 0) {
    throw new Error("ChatGPT returned an invalid refreshed credential set");
  }
  const granted = typeof result.scope === "string" ? result.scope.split(/\s+/).filter(Boolean) : [];
  if (!hasChatGPTPlanScopes(granted)) throw new Error("ChatGPT refresh did not retain the required plan usage scopes; reconnect the account");
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    id_token: typeof result.id_token === "string" ? result.id_token : undefined,
    expires_at: Date.now() + result.expires_in * 1000,
    scopes: granted,
  };
}

export async function revokeChatGPTRefreshToken(clientId: string, refreshToken: string) {
  const configResponse = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!configResponse.ok) throw new Error("OpenAI revocation metadata unavailable");
  const config = await configResponse.json() as { revocation_endpoint?: string };
  if (!config.revocation_endpoint) throw new Error("OpenAI revocation endpoint unavailable");
  const response = await fetch(config.revocation_endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token", client_id: clientId }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenAI revocation failed (HTTP ${response.status})`);
}

export async function listChatGPTModels(accessToken: string) {
  const response = await fetch(`${resource}/models`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ChatGPT model catalog failed (HTTP ${response.status})`);
  const data = await response.json() as { models?: Array<{ slug?: string; display_name?: string; visibility?: string }> };
  return (data.models ?? []).filter(model => model.visibility === "list" && model.slug && model.display_name)
    .map(model => ({ id: model.slug!, name: model.display_name! }));
}

export async function testChatGPTResponse(accessToken: string, model: string) {
  const response = await fetch(`${resource}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: [{ role: "user", content: "Reply with exactly: CineMesh connection verified." }], store: false, stream: true }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ChatGPT Responses API returned HTTP ${response.status}`);
  if (!response.body) throw new Error("ChatGPT Responses API returned no stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", completed = false, text = "";
  const consume = (item: string) => {
    const data = item.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
    if (!data || data === "[DONE]") return;
    let event: { type?: string; delta?: string; response?: { error?: { code?: string } } };
    try { event = JSON.parse(data); } catch { return; }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
    if (event.type === "response.failed") throw new Error(`ChatGPT request failed${event.response?.error?.code ? ` (${event.response.error.code})` : ""}`);
    if (event.type === "response.incomplete") throw new Error("ChatGPT returned an incomplete response");
    if (event.type === "response.completed") completed = true;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const item of events) consume(item);
    }
  } finally { reader.releaseLock(); }
  if (!completed || text.trim() !== "CineMesh connection verified.") throw new Error("ChatGPT did not complete the verification response");
  return text.trim();
}
