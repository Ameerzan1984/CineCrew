import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { allowedOrigin } from "../../../../../lib/origin";
import { encryptHiggsfieldMcpVerifier } from "../../../../../lib/provider-vault";
import { buildHiggsfieldMcpAuthorizationUrl, discoverHiggsfieldMcpOAuth, registerHiggsfieldMcpClient } from "../../../../../lib/higgsfield-mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "cinemesh_hf_mcp_state";
const CALLBACK_PATH = "/api/connections/higgsfield-mcp/callback";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const body = await request.text();
    if (body.length > 1024) return json({ error: "Request too large" }, 413);
    if (body && (JSON.parse(body)?.action !== "connect")) return json({ error: "Unknown action" }, 400);

    const origin = request.headers.get("origin")!;
    const callbackUri = `${origin}${CALLBACK_PATH}`;
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const metadata = await discoverHiggsfieldMcpOAuth();
    const prior = await database().query("SELECT client_id,callback_uri FROM higgsfield_mcp_connections WHERE user_id=$1",[user.id]);
    const client = prior.rows[0]?.callback_uri === callbackUri
      ? { clientId: prior.rows[0].client_id as string }
      : await registerHiggsfieldMcpClient(metadata, callbackUri);
    const encryptedVerifier = encryptHiggsfieldMcpVerifier(user.id, verifier);
    const stateHash = createHash("sha256").update(state).digest("hex");
    const db = database();
    await db.query("DELETE FROM higgsfield_mcp_oauth_states WHERE expires_at < now()");
    await db.query(`INSERT INTO higgsfield_mcp_oauth_states(state_hash,user_id,client_id,callback_uri,encrypted_verifier,expires_at)
      VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')`, [stateHash,user.id,client.clientId,callbackUri,encryptedVerifier]);

    const response = json({ authorizationUrl: buildHiggsfieldMcpAuthorizationUrl(metadata,client.clientId,callbackUri,state,verifier) });
    const secure = new URL(callbackUri).protocol === "https:";
    (await cookies()).set(COOKIE,state,{ httpOnly:true,secure,sameSite:"lax",path:CALLBACK_PATH,maxAge:600 });
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: error instanceof Error ? error.message : "Could not start Higgsfield MCP authorization" }, 502);
  }
}
