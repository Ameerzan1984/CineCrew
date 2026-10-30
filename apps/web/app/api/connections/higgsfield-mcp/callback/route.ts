import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../../../lib/db";
import { decryptHiggsfieldMcpVerifier, encryptHiggsfieldMcpTokens } from "../../../../../lib/provider-vault";
import { discoverHiggsfieldMcpOAuth, exchangeHiggsfieldMcpCode, inspectHiggsfieldMcpTools } from "../../../../../lib/higgsfield-mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "cinemesh_hf_mcp_state";
const COOKIE_PATH = "/api/connections/higgsfield-mcp/callback";

function safeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
        url.pathname === COOKIE_PATH && !url.search && !url.hash) return url.origin;
  } catch { /* Invalid stored redirect URL. */ }
  return null;
}

function fallbackOrigin(request: NextRequest): string {
  const value = process.env.APP_ORIGIN || request.nextUrl.origin;
  try {
    const url = new URL(value);
    if (url.origin === value && (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname)))) return url.origin;
  } catch { /* Use a safe loopback fallback when the deployment origin is misconfigured. */ }
  return "http://127.0.0.1:3000";
}

function finish(origin: string, outcome: "connected" | "error") {
  const target = new URL("/", origin);
  target.searchParams.set("higgsfield_mcp", outcome);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(COOKIE,"",{ httpOnly:true,secure:origin.startsWith("https:"),sameSite:"lax",path:COOKIE_PATH,maxAge:0 });
  return response;
}

export async function GET(request: NextRequest) {
  const appFallback = fallbackOrigin(request);
  try {
    const state = request.nextUrl.searchParams.get("state") || "";
    const code = request.nextUrl.searchParams.get("code") || "";
    const returnedIssuer = request.nextUrl.searchParams.get("iss");
    const cookieState = (await cookies()).get(COOKIE)?.value || "";
    const isSameState = state.length === cookieState.length && state.length >= 40 &&
      timingSafeEqual(Buffer.from(state),Buffer.from(cookieState));
    if (!isSameState) return finish(appFallback,"error");

    const stateHash = createHash("sha256").update(state).digest("hex");
    const pending = await database().query(`DELETE FROM higgsfield_mcp_oauth_states WHERE state_hash=$1 AND expires_at>now()
      RETURNING user_id,client_id,callback_uri,encrypted_verifier`, [stateHash]);
    if (!pending.rowCount) return finish(appFallback,"error");
    const saved = pending.rows[0];
    const appOrigin = safeOrigin(saved.callback_uri) || appFallback;
    if (request.nextUrl.searchParams.has("error") || !code ||
        (returnedIssuer && returnedIssuer !== "https://clerk.higgsfield.ai")) return finish(appOrigin,"error");

    const metadata = await discoverHiggsfieldMcpOAuth();
    const verifier = decryptHiggsfieldMcpVerifier(saved.user_id,saved.encrypted_verifier);
    const tokens = await exchangeHiggsfieldMcpCode(metadata,saved.client_id,saved.callback_uri,code,verifier);
    // A successful OAuth redirect alone is not a connected state: validate the bearer token
    // with a read-only MCP initialize/tools/list exchange before storing it as verified.
    const tools = await inspectHiggsfieldMcpTools(tokens.accessToken);
    const encryptedTokens = encryptHiggsfieldMcpTokens(saved.user_id,tokens);
    await database().query(`INSERT INTO higgsfield_mcp_connections(user_id,client_id,callback_uri,encrypted_tokens,scopes,tools,access_expires_at,verified_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,now())
      ON CONFLICT(user_id) DO UPDATE SET client_id=$2,callback_uri=$3,encrypted_tokens=$4,scopes=$5,tools=$6::jsonb,access_expires_at=$7,verified_at=now(),updated_at=now()`,
      [saved.user_id,saved.client_id,saved.callback_uri,encryptedTokens,tokens.scopes,JSON.stringify(tools),tokens.expiresAt ? new Date(tokens.expiresAt) : null]);
    return finish(appOrigin,"connected");
  } catch {
    return finish(appFallback,"error");
  }
}
