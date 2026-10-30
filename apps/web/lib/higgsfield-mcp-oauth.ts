import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const HIGGSFIELD_MCP_RESOURCE = "https://mcp.higgsfield.ai/mcp";
const TRUSTED_AUTHORIZATION_SERVER = "https://clerk.higgsfield.ai";
const RESOURCE_METADATA_URL = "https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp";
const AUTH_METADATA_URL = `${TRUSTED_AUTHORIZATION_SERVER}/.well-known/oauth-authorization-server`;

export type HiggsfieldMcpClient = { clientId: string };
export type HiggsfieldMcpToken = {
  accessToken: string;
  refreshToken: string | null;
  clientId: string;
  expiresAt: number | null;
  scopes: string[];
};
export type HiggsfieldMcpTool = {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown> | null;
};
export type HiggsfieldMcpOAuthMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint?: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
  scopes_supported: string[];
};

async function getJson(url: string, label: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error(`${label} could not be reached.`);
  }
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned invalid metadata.`);
  return value as Record<string, unknown>;
}

function isTrustedEndpoint(value: unknown, path?: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === TRUSTED_AUTHORIZATION_SERVER && (!path || url.pathname === path) && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export async function discoverHiggsfieldMcpOAuth(fetcher: typeof fetch = fetch): Promise<HiggsfieldMcpOAuthMetadata> {
  const resource = await getJson(RESOURCE_METADATA_URL, "Higgsfield MCP OAuth metadata",fetcher);
  const servers = resource.authorization_servers;
  if (resource.resource !== HIGGSFIELD_MCP_RESOURCE || !Array.isArray(servers) || !servers.includes(TRUSTED_AUTHORIZATION_SERVER)) {
    throw new Error("Higgsfield MCP did not advertise its expected OAuth authorization server.");
  }
  const value = await getJson(AUTH_METADATA_URL, "Higgsfield OAuth server",fetcher);
  const scopesSupported = Array.isArray(value.scopes_supported) ? value.scopes_supported as string[] : [];
  if (value.issuer !== TRUSTED_AUTHORIZATION_SERVER ||
      !isTrustedEndpoint(value.authorization_endpoint, "/oauth/authorize") ||
      !isTrustedEndpoint(value.token_endpoint, "/oauth/token") ||
      !isTrustedEndpoint(value.registration_endpoint, "/oauth/register") ||
      (value.revocation_endpoint !== undefined && !isTrustedEndpoint(value.revocation_endpoint, "/oauth/token/revoke")) ||
      !Array.isArray(value.response_types_supported) || !value.response_types_supported.includes("code") ||
      !Array.isArray(value.grant_types_supported) || !value.grant_types_supported.includes("authorization_code") ||
      !Array.isArray(value.token_endpoint_auth_methods_supported) || !value.token_endpoint_auth_methods_supported.includes("none") ||
      !Array.isArray(value.code_challenge_methods_supported) || !value.code_challenge_methods_supported.includes("S256") ||
      !Array.isArray(value.scopes_supported) || !["openid", "email", "offline_access"].every(scope => scopesSupported.includes(scope))) {
    throw new Error("Higgsfield OAuth metadata does not support the required public-client PKCE flow.");
  }
  return value as HiggsfieldMcpOAuthMetadata;
}

export async function registerHiggsfieldMcpClient(metadata: HiggsfieldMcpOAuthMetadata, redirectUri: string): Promise<HiggsfieldMcpClient> {
  if (!isTrustedEndpoint(metadata.registration_endpoint,"/oauth/register")) throw new Error("The Higgsfield OAuth registration endpoint is invalid.");
  const callback = new URL(redirectUri);
  if ((callback.protocol !== "https:" && !(callback.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname))) ||
      callback.pathname !== "/api/connections/higgsfield-mcp/callback" || callback.search || callback.hash) {
    throw new Error("The CineMesh OAuth callback URL is invalid.");
  }
  let response: Response;
  try {
    response = await fetch(metadata.registration_endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_name: "CineMesh",
        application_type: "web",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: "openid email offline_access",
      }),
    });
  } catch { throw new Error("Higgsfield OAuth client registration failed."); }
  if (!response.ok) throw new Error(`Higgsfield OAuth client registration returned HTTP ${response.status}.`);
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== "object" || Array.isArray(result) || typeof (result as Record<string, unknown>).client_id !== "string") {
    throw new Error("Higgsfield did not return a valid OAuth client ID.");
  }
  return { clientId: (result as { client_id: string }).client_id };
}

export function buildHiggsfieldMcpAuthorizationUrl(metadata: HiggsfieldMcpOAuthMetadata, clientId: string, redirectUri: string, state: string, verifier: string): string {
  if (!isTrustedEndpoint(metadata.authorization_endpoint,"/oauth/authorize")) throw new Error("The Higgsfield OAuth authorization endpoint is invalid.");
  const challenge = createChallenge(verifier);
  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid email offline_access");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", HIGGSFIELD_MCP_RESOURCE);
  return url.toString();
}

function createChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function exchangeHiggsfieldMcpCode(metadata: HiggsfieldMcpOAuthMetadata, clientId: string, redirectUri: string, code: string, verifier: string): Promise<HiggsfieldMcpToken> {
  if (!isTrustedEndpoint(metadata.token_endpoint,"/oauth/token")) throw new Error("The Higgsfield OAuth token endpoint is invalid.");
  const body = new URLSearchParams({
    grant_type: "authorization_code", client_id: clientId, code,
    redirect_uri: redirectUri, code_verifier: verifier, resource: HIGGSFIELD_MCP_RESOURCE,
  });
  let response: Response;
  try {
    response = await fetch(metadata.token_endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body,
    });
  } catch { throw new Error("Higgsfield OAuth token exchange failed."); }
  if (!response.ok) throw new Error(`Higgsfield OAuth token exchange returned HTTP ${response.status}.`);
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Higgsfield returned an invalid OAuth token response.");
  const data = value as Record<string, unknown>;
  if (typeof data.access_token !== "string" || !data.access_token ||
      !(data.token_type === undefined || (typeof data.token_type === "string" && data.token_type.toLowerCase() === "bearer")) ||
      !(data.refresh_token === undefined || (typeof data.refresh_token === "string" && !!data.refresh_token)) ||
      !(data.expires_in === undefined || (typeof data.expires_in === "number" && Number.isFinite(data.expires_in) && data.expires_in > 0))) {
    throw new Error("Higgsfield returned an invalid OAuth token response.");
  }
  const scopes = typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : ["openid", "email", "offline_access"];
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    clientId,
    expiresAt: typeof data.expires_in === "number" ? Date.now() + data.expires_in * 1000 : null,
    scopes,
  };
}

export async function refreshHiggsfieldMcpToken(metadata: HiggsfieldMcpOAuthMetadata, current: HiggsfieldMcpToken): Promise<HiggsfieldMcpToken> {
  if (!isTrustedEndpoint(metadata.token_endpoint,"/oauth/token")) throw new Error("The Higgsfield OAuth token endpoint is invalid.");
  if (!current.refreshToken) throw new Error("Higgsfield MCP authorization needs to be reconnected.");
  const body = new URLSearchParams({
    grant_type: "refresh_token", client_id: current.clientId,
    refresh_token: current.refreshToken, resource: HIGGSFIELD_MCP_RESOURCE,
  });
  let response: Response;
  try {
    response = await fetch(metadata.token_endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body,
    });
  } catch { throw new Error("Higgsfield MCP session refresh failed."); }
  if (!response.ok) throw new Error(`Higgsfield MCP session refresh returned HTTP ${response.status}.`);
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Higgsfield returned an invalid token refresh response.");
  const data = value as Record<string, unknown>;
  if (typeof data.access_token !== "string" || !data.access_token ||
      !(data.token_type === undefined || (typeof data.token_type === "string" && data.token_type.toLowerCase() === "bearer")) ||
      !(data.refresh_token === undefined || (typeof data.refresh_token === "string" && !!data.refresh_token)) ||
      !(data.expires_in === undefined || (typeof data.expires_in === "number" && Number.isFinite(data.expires_in) && data.expires_in > 0))) {
    throw new Error("Higgsfield returned an invalid token refresh response.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : current.refreshToken,
    clientId: current.clientId,
    expiresAt: typeof data.expires_in === "number" ? Date.now() + data.expires_in * 1000 : null,
    scopes: typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : current.scopes,
  };
}

export async function revokeHiggsfieldMcpToken(metadata: HiggsfieldMcpOAuthMetadata, clientId: string, token: string): Promise<boolean> {
  if (!metadata.revocation_endpoint || !isTrustedEndpoint(metadata.revocation_endpoint,"/oauth/token/revoke")) return false;
  try {
    const response = await fetch(metadata.revocation_endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ token, token_type_hint: "refresh_token", client_id: clientId }),
    });
    return response.ok;
  } catch { return false; }
}

export function summarizeHiggsfieldMcpVideoGeneration(tools: HiggsfieldMcpTool[] | null | undefined) {
  const tool = tools?.find(item => item.name === "generate_video");
  const properties = tool?.inputSchema?.properties;
  const fields = properties && typeof properties === "object" && !Array.isArray(properties)
    ? Object.keys(properties as Record<string, unknown>)
    : [];
  const params = properties && typeof properties === "object" && !Array.isArray(properties)
    ? (properties as Record<string, unknown>).params
    : null;
  const paramsFields = params && typeof params === "object" && !Array.isArray(params) &&
    (params as Record<string, unknown>).properties && typeof (params as Record<string, unknown>).properties === "object"
      ? Object.keys((params as { properties: Record<string, unknown> }).properties)
      : [];
  const schemaHasParameters = fields.length > 0 || paramsFields.length > 0;

  return {
    advertised: !!tool,
    toolName: tool?.name ?? null,
    schemaKnown: !!tool && tool.inputSchema !== null,
    schemaHasParameters,
    fields: fields.slice(0, 24),
    paramsFields: paramsFields.slice(0, 24),
    executable: false,
    reason: !tool
      ? "This account did not advertise a video generation tool."
      : tool?.inputSchema === null
        ? "CineMesh has no current input schema for generate_video. Reconnect MCP to refresh this account's tool metadata."
      : !schemaHasParameters
        ? "Higgsfield lists generate_video without its parameter schema. CineMesh will not guess paid generation arguments."
        : "CineMesh currently verifies MCP access and tool listings; MCP video generation is not enabled yet.",
  };
}

function safeToolInputSchema(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 16_384) return null;
    const parsed: unknown = JSON.parse(serialized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

export async function inspectHiggsfieldMcpTools(accessToken: string): Promise<HiggsfieldMcpTool[]> {
  const client = new Client({ name: "CineMesh", version: "0.1.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(HIGGSFIELD_MCP_RESOURCE), {
    redirectPolicy: "same-origin",
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error" },
  });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools.map(tool => ({
      name: tool.name,
      description: typeof tool.description === "string" ? tool.description.slice(0, 1000) : null,
      inputSchema: safeToolInputSchema(tool.inputSchema),
    }));
  } finally {
    await transport.close().catch(() => undefined);
  }
}
