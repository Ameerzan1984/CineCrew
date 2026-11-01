import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { database } from "../../../../lib/db";
import { allowedOrigin } from "../../../../lib/origin";
import { encryptLlmApiKey, decryptLlmApiKey, llmVaultReady } from "../../../../lib/llm-api-vault";
import { listOpenAIApiModels } from "../../../../lib/openai-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const result = await database().query("SELECT verified_at FROM llm_api_connections WHERE user_id=$1 AND provider='openai_api'", [user.id]);
    return json({ provider: "openai_api", configured: !!result.rowCount, verifiedAt: result.rows[0]?.verified_at ?? null, vaultReady: llmVaultReady() });
  } catch { return json({ error: "Language provider settings unavailable" }, 503); }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw) as { action?: unknown; apiKey?: unknown };
    const db = database();
    if (input.action === "save") {
      if (typeof input.apiKey !== "string" || !/^[!-~]{16,512}$/.test(input.apiKey)) return json({ error: "Enter a valid API credential" }, 400);
      const encrypted = encryptLlmApiKey(user.id, "openai_api", input.apiKey);
      await db.query(`INSERT INTO llm_api_connections(user_id,provider,encrypted_credentials) VALUES($1,'openai_api',$2)
        ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_credentials=$2,verified_at=NULL,updated_at=now()`, [user.id, encrypted]);
      return json({ configured: true, verifiedAt: null });
    }
    if (input.action === "disconnect") {
      await db.query("DELETE FROM llm_api_connections WHERE user_id=$1 AND provider='openai_api'", [user.id]);
      return json({ disconnected: true });
    }
    if (input.action === "models") {
      const result = await db.query("SELECT encrypted_credentials FROM llm_api_connections WHERE user_id=$1 AND provider='openai_api'", [user.id]);
      const encrypted = result.rows[0]?.encrypted_credentials;
      if (!encrypted) return json({ error: "Connect your OpenAI API account first" }, 409);
      const models = await listOpenAIApiModels(decryptLlmApiKey(user.id, "openai_api", encrypted));
      const updated = await db.query("UPDATE llm_api_connections SET verified_at=now(),updated_at=now() WHERE user_id=$1 AND provider='openai_api' AND encrypted_credentials=$2 RETURNING verified_at", [user.id, encrypted]);
      if (!updated.rowCount) return json({ error: "Credentials changed during verification; try again" }, 409);
      return json({ models, verifiedAt: updated.rows[0].verified_at });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Language provider settings or model discovery unavailable" }, 503);
  }
}
