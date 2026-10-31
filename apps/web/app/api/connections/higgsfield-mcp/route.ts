import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { database } from "../../../../lib/db";
import { allowedOrigin } from "../../../../lib/origin";
import { decryptHiggsfieldMcpTokens } from "../../../../lib/provider-vault";
import { discoverHiggsfieldMcpOAuth, revokeHiggsfieldMcpToken } from "../../../../lib/higgsfield-mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"),request.nextUrl.origin)) return json({ error: "Invalid request origin" },403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" },401);
    const raw = await request.text();
    if (raw.length > 1024) return json({ error: "Request too large" },413);
    const input = JSON.parse(raw);
    if (input?.action !== "disconnect") return json({ error: "Unknown action" },400);
    const db = database();
    const row = await db.query("SELECT encrypted_tokens FROM higgsfield_mcp_connections WHERE user_id=$1",[user.id]);
    await db.query("DELETE FROM higgsfield_mcp_connections WHERE user_id=$1",[user.id]);
    if (!row.rowCount) return json({ disconnected:true,remotelyRevoked:false });
    try {
      const tokens = decryptHiggsfieldMcpTokens(user.id,row.rows[0].encrypted_tokens);
      const metadata = await discoverHiggsfieldMcpOAuth();
      const remotelyRevoked = tokens.refreshToken
        ? await revokeHiggsfieldMcpToken(metadata,tokens.clientId,tokens.refreshToken)
        : false;
      return json({ disconnected:true,remotelyRevoked });
    } catch { return json({ disconnected:true,remotelyRevoked:false }); }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error:"Invalid JSON" },400);
    return json({ error:"Could not disconnect Higgsfield MCP" },503);
  }
}
