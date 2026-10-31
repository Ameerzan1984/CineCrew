import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { database } from "../../../../lib/db";
import { allowedOrigin } from "../../../../lib/origin";
import { decryptChatGPTSecret, encryptChatGPTSecret } from "../../../../lib/chatgpt-vault";
import { chatGPTAccessToken } from "../../../../lib/chatgpt-plan-credentials";
import {
  buildAuthorizationUrl, ChatGPTTokens, hasChatGPTPlanScopes, hashState, opaqueValue, validateChatGPTRedirectUri,
  revokeChatGPTRefreshToken, listChatGPTModels, testChatGPTResponse,
} from "../../../../lib/chatgpt-plan-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const newClient = "dynamic_agent_client";

function redirectUri() {
  const value = process.env.CHATGPT_REDIRECT_URI ?? "http://127.0.0.1:3000/api/connections/chatgpt/callback";
  return validateChatGPTRedirectUri(value);
}

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const result = await database().query("SELECT email,display_name,scopes,last_inference_at,updated_at FROM chatgpt_plan_connections WHERE user_id=$1", [user.id]);
    const row = result.rows[0];
    return json({
      vaultReady: !!(process.env.CHATGPT_VAULT_KEY || process.env.HIGGSFIELD_VAULT_KEY),
      connected: !!row,
      account: row ? { email: row.email, name: row.display_name, planUsageEnabled: hasChatGPTPlanScopes(row.scopes), lastInferenceAt: row.last_inference_at, connectedAt: row.updated_at } : null,
      usageUrl: "https://chatgpt.com/settings/usage",
    });
  } catch { return json({ error: "ChatGPT connection settings unavailable" }, 503); }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const raw = await request.text();
    if (raw.length > 8192) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw) as { action?: string; model?: string };
    const db = database();

    if (input.action === "connect") {
      if (!(process.env.CHATGPT_VAULT_KEY || process.env.HIGGSFIELD_VAULT_KEY)) return json({ error: "Configure CHATGPT_VAULT_KEY before connecting a ChatGPT account" }, 503);
      const returnOrigin = request.nextUrl.origin;
      const parsedOrigin = new URL(returnOrigin);
      if (parsedOrigin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsedOrigin.hostname) || parsedOrigin.port !== "3000") return json({ error: "Sign in to the local CineMesh app on port 3000 to connect ChatGPT" }, 400);
      const existing = await db.query("SELECT client_id,subject FROM chatgpt_plan_connections WHERE user_id=$1", [user.id]);
      const registration = !existing.rows[0];
      const hostId = await ensureHostId();
      const state = opaqueValue();
      const transaction = {
        nonce: opaqueValue(),
        verifier: opaqueValue(48),
        clientId: registration ? newClient : existing.rows[0].client_id as string,
        expectedSubject: registration ? null : existing.rows[0].subject as string,
        redirectUri: redirectUri(),
        returnOrigin,
        createdAt: Date.now(),
      };
      await db.query("DELETE FROM chatgpt_oauth_transactions WHERE expires_at<now()");
      await db.query("INSERT INTO chatgpt_oauth_transactions(state_hash,user_id,encrypted_transaction,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [hashState(state), user.id, encryptChatGPTSecret(user.id, transaction, "oauth-transaction")]);
      return json({ authorizationUrl: buildAuthorizationUrl({ state, transaction, hostId, registration }) });
    }

    if (input.action === "disconnect") {
      const client = await db.connect();
      let revoked = false;
      try {
        await client.query("BEGIN");
        const found = await client.query("SELECT client_id,encrypted_credentials FROM chatgpt_plan_connections WHERE user_id=$1 FOR UPDATE", [user.id]);
        if (found.rows[0]) {
          const tokens = decryptChatGPTSecret<ChatGPTTokens>(user.id, found.rows[0].encrypted_credentials);
          try { await revokeChatGPTRefreshToken(found.rows[0].client_id, tokens.refresh_token); revoked = true; } catch { /* clear locally even if remote revocation is unavailable */ }
          await client.query("DELETE FROM chatgpt_plan_connections WHERE user_id=$1", [user.id]);
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      return json({ disconnected: true, remotelyRevoked: revoked });
    }

    if (input.action === "models" || input.action === "test") {
      const accessToken = await chatGPTAccessToken(user.id);
      const models = await listChatGPTModels(accessToken);
      if (input.action === "models") return json({ models });
      if (typeof input.model !== "string" || !models.some(item => item.id === input.model)) return json({ error: "Choose a model from the connected ChatGPT account" }, 400);
      const verifiedResponse = await testChatGPTResponse(accessToken, input.model);
      await db.query("UPDATE chatgpt_plan_connections SET last_inference_at=now(),updated_at=now() WHERE user_id=$1", [user.id]);
      return json({ verified: true, response: verifiedResponse });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    const message = error instanceof Error ? error.message : "ChatGPT request failed";
    return json({ error: message.slice(0, 240) }, 502);
  }
}

async function ensureHostId() {
  const db = database();
  const candidate = `urn:uuid:${randomUUID()}`;
  await db.query("INSERT INTO application_settings(key,value) VALUES('chatgpt_plan_host_id',$1) ON CONFLICT(key) DO NOTHING", [candidate]);
  const found = await db.query("SELECT value FROM application_settings WHERE key='chatgpt_plan_host_id'");
  const value = found.rows[0]?.value;
  if (typeof value !== "string" || !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("ChatGPT host identity is invalid");
  return value;
}
