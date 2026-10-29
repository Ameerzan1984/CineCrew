import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { allowedOrigin } from "../../../lib/origin";
import { encryptProviderCredentials, decryptProviderCredentials } from "../../../lib/provider-vault";
import { HiggsfieldApiClient, HiggsfieldHttpError } from "../../../../../packages/providers/src/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function state(row?: { verified_at: string | Date | null }) {
  return {
    api: { configured: !!row, verified: !!row?.verified_at, verifiedAt: row?.verified_at ?? null },
    mcp: { available: false, reason: "Standalone OAuth client registration has not been verified." },
    models: [], jobs: [], usage: null, balance: null,
  };
}
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return response({ error: "Sign in required" }, 401);
    const result = await database().query("SELECT verified_at FROM provider_connections WHERE user_id=$1 AND provider='higgsfield-api'", [user.id]);
    return response(state(result.rows[0]));
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
      if (typeof input.keyId !== "string" || typeof input.keySecret !== "string" || !input.keyId.trim() || !input.keySecret.trim() || input.keyId.length > 512 || input.keySecret.length > 512 || /[:\r\n]/.test(input.keyId) || /[\r\n]/.test(input.keySecret)) return response({ error: "A valid API key ID and secret are required" }, 400);
      const encrypted = encryptProviderCredentials(user.id, { keyId: input.keyId, keySecret: input.keySecret });
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
