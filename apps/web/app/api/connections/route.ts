import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { allowedOrigin } from "../../../lib/origin";
import { encryptProviderCredentials, decryptProviderCredentials, decryptHiggsfieldMcpTokens, encryptHiggsfieldMcpTokens } from "../../../lib/provider-vault";
import { HiggsfieldApiClient, HiggsfieldHttpError, HIGGSFIELD_SEEDANCE_25_MODEL, parseHiggsfieldApiKey } from "../../../../../packages/providers/src/index";
import { describeHiggsfieldMcpConnection, discoverHiggsfieldMcpOAuth, inspectHiggsfieldMcpTools, refreshHiggsfieldMcpToken, summarizeHiggsfieldMcpVideoGeneration, type HiggsfieldMcpTool } from "../../../lib/higgsfield-mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function refreshMcpIfNeeded(userId: string, row?: Record<string, unknown>) {
  if (!row || typeof row.encrypted_tokens !== "string") return row;
  const client = await database().connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN"); inTransaction = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`higgsfield-mcp-refresh:${userId}`]);
    const latest = await client.query("SELECT client_id,callback_uri,encrypted_tokens,scopes,tools,access_expires_at,verified_at FROM higgsfield_mcp_connections WHERE user_id=$1 FOR UPDATE",[userId]);
    if (!latest.rowCount || typeof latest.rows[0].encrypted_tokens !== "string") { await client.query("COMMIT"); return undefined; }
    const currentRow = latest.rows[0] as Record<string, unknown>;
    const expiresAt = currentRow.access_expires_at ? new Date(currentRow.access_expires_at as string | Date).getTime() : null;
    if (!expiresAt || expiresAt > Date.now() + 60_000) { await client.query("COMMIT"); return currentRow; }
    const oldCiphertext = currentRow.encrypted_tokens as string;
    const current = decryptHiggsfieldMcpTokens(userId,oldCiphertext);
    if (!current.refreshToken) { await client.query("COMMIT"); return currentRow; }
    const metadata = await discoverHiggsfieldMcpOAuth();
    const tokens = await refreshHiggsfieldMcpToken(metadata,current);
    const tools = await inspectHiggsfieldMcpTools(tokens.accessToken);
    const encrypted = encryptHiggsfieldMcpTokens(userId,tokens);
    const saved = await client.query(`UPDATE higgsfield_mcp_connections SET encrypted_tokens=$2,scopes=$3,tools=$4::jsonb,
      access_expires_at=$5,verified_at=now(),updated_at=now() WHERE user_id=$1 RETURNING client_id,callback_uri,encrypted_tokens,scopes,tools,access_expires_at,verified_at`,
      [userId,encrypted,tokens.scopes,JSON.stringify(tools),tokens.expiresAt ? new Date(tokens.expiresAt) : null]);
    await client.query("COMMIT"); inTransaction = false;
    return saved.rows[0];
  } catch {
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    return row;
  } finally { client.release(); }
}
function state(row?: { verified_at: string | Date | null }, jobs: unknown[] = [], mcp?: { verified_at: string | Date | null; tools: HiggsfieldMcpTool[]; access_expires_at: string | Date | null }) {
  const mcpExpired = !!mcp?.access_expires_at && new Date(mcp.access_expires_at).getTime() <= Date.now();
  const videoGeneration = summarizeHiggsfieldMcpVideoGeneration(mcp?.tools);
  return {
    api: { configured: !!row, verified: !!row?.verified_at, verifiedAt: row?.verified_at ?? null },
    mcp: { available: true, connected: !!mcp?.verified_at && !mcpExpired, verifiedAt: mcp?.verified_at ?? null, tools: mcp?.tools ?? [], videoGeneration, reason: describeHiggsfieldMcpConnection(!!mcp?.verified_at, mcpExpired) },
    models: [
      { id: HIGGSFIELD_SEEDANCE_25_MODEL.slice(1), name: "Seedance 2.5 Text-to-Video", documented: true },
      { id: "bytedance/seedance-2.5/reference-to-video", name: "Seedance 2.5 Reference-to-Video", documented: true },
    ],
    jobs, usage: null, balance: null,
  };
}
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return response({ error: "Sign in required" }, 401);
    const db = database();
    const [result, jobs, mcpResult] = await Promise.all([
      db.query("SELECT verified_at FROM provider_connections WHERE user_id=$1 AND provider='higgsfield-api'", [user.id]),
      db.query(`SELECT j.id,j.model_path,j.status,j.created_at,j.updated_at,s.title AS scene_title
        FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id
        WHERE j.contributor_id=$1 ORDER BY j.created_at DESC LIMIT 20`, [user.id]),
      db.query("SELECT client_id,callback_uri,encrypted_tokens,scopes,tools,access_expires_at,verified_at FROM higgsfield_mcp_connections WHERE user_id=$1",[user.id]),
    ]);
    const mcp = await refreshMcpIfNeeded(user.id,mcpResult.rows[0]);
    return response(state(result.rows[0], jobs.rows, mcp as Parameters<typeof state>[2]));
  } catch { return response({ error: "Connection settings unavailable" }, 503); }
}
export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return response({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return response({ error: "Sign in required" }, 401);
    const raw = await request.text();
    if (raw.length > 8192) return response({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return response({ error: "Invalid request" }, 400);
    const db = database();
    if (input.action === "save") {
      let credentials;
      try {
        if (typeof input.apiKey === "string") credentials = parseHiggsfieldApiKey(input.apiKey);
        else if (typeof input.keyId === "string" && typeof input.keySecret === "string") credentials = parseHiggsfieldApiKey(`${input.keyId}:${input.keySecret}`);
        else return response({ error: "A complete Higgsfield API key is required" }, 400);
      } catch (error) {
        if (error instanceof Error) return response({ error: error.message }, 400);
        return response({ error: "A valid Higgsfield API key is required" }, 400);
      }
      const encrypted = encryptProviderCredentials(user.id, credentials);
      await db.query("INSERT INTO provider_connections(user_id,provider,encrypted_credentials) VALUES($1,'higgsfield-api',$2) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_credentials=$2, verified_at=NULL, updated_at=now()", [user.id, encrypted]);
      return response(state({ verified_at: null }));
    }
    if (input.action === "disconnect") {
      await db.query("DELETE FROM provider_connections WHERE user_id=$1 AND provider='higgsfield-api'", [user.id]);
      return response(state());
    }
    if (input.action === "verify") {
      if (typeof input.requestId !== "string" || !uuid.test(input.requestId)) return response({ error: "An existing Higgsfield API request ID is required to verify credentials without generating media" }, 400);
      const found = await db.query("SELECT encrypted_credentials FROM provider_connections WHERE user_id=$1 AND provider='higgsfield-api'", [user.id]);
      const encrypted = found.rows[0]?.encrypted_credentials;
      if (!encrypted) return response({ error: "Save API credentials first" }, 404);
      const client = new HiggsfieldApiClient(decryptProviderCredentials(user.id, encrypted));
      const requestId = input.requestId.toLowerCase();
      const root = `https://api.higgsfield.ai/requests/${requestId}`;
      try {
        await client.status({ requestId, statusUrl: `${root}/status`, cancelUrl: `${root}/cancel` });
      } catch (error) {
        if (error instanceof HiggsfieldHttpError && error.status === 401) {
          await db.query("UPDATE provider_connections SET verified_at=NULL,updated_at=now() WHERE user_id=$1 AND provider='higgsfield-api' AND encrypted_credentials=$2", [user.id, encrypted]);
        }
        throw error;
      }
      const updated = await db.query("UPDATE provider_connections SET verified_at=now(),updated_at=now() WHERE user_id=$1 AND provider='higgsfield-api' AND encrypted_credentials=$2 RETURNING verified_at", [user.id, encrypted]);
      if (!updated.rowCount) return response({ error: "Credentials changed during verification; try again" }, 409);
      return response(state(updated.rows[0]));
    }
    return response({ error: "Unknown action" }, 400);
  } catch (error) {
    if (error instanceof SyntaxError) return response({ error: "Invalid JSON" }, 400);
    if (error instanceof HiggsfieldHttpError) return response({ error: `Higgsfield returned HTTP ${error.status}; credentials were not verified` }, 502);
    return response({ error: "Connection settings unavailable or verification failed" }, 503);
  }
}
