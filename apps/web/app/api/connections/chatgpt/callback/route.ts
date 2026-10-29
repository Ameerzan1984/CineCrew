import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../../../lib/db";
import { decryptChatGPTSecret, encryptChatGPTSecret } from "../../../../../lib/chatgpt-vault";
import { callbackClientId, ChatGPTTokens, exchangeAuthorizationCode, hashState, OAuthTransaction } from "../../../../../lib/chatgpt-plan-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function returnToApp(status: "connected" | "denied" | "failed" | "permission", origin = "http://127.0.0.1:3000") {
  return NextResponse.redirect(new URL(`/?chatgpt=${status}`, origin), { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (state.length < 32 || state.length > 128) return returnToApp("failed");
  const db = database();
  const client = await db.connect();
  let transactionRow: { user_id: string; encrypted_transaction: string } | undefined;
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT user_id,encrypted_transaction FROM chatgpt_oauth_transactions WHERE state_hash=$1 AND expires_at>now() FOR UPDATE", [hashState(state)]);
    transactionRow = found.rows[0];
    if (transactionRow) await client.query("DELETE FROM chatgpt_oauth_transactions WHERE state_hash=$1", [hashState(state)]);
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return returnToApp("failed");
  } finally { client.release(); }
  if (!transactionRow) return returnToApp("failed");

  let returnOrigin = "http://127.0.0.1:3000";
  try {
    const userId = transactionRow.user_id;
    const transaction = decryptChatGPTSecret<OAuthTransaction & { expectedSubject: string | null; returnOrigin: string }>(userId, transactionRow.encrypted_transaction, "oauth-transaction");
    const parsedOrigin = new URL(transaction.returnOrigin);
    if (parsedOrigin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsedOrigin.hostname) || parsedOrigin.port !== "3000") return returnToApp("failed");
    returnOrigin = parsedOrigin.origin;
    if (request.nextUrl.searchParams.has("error")) return returnToApp("denied", returnOrigin);
    const code = request.nextUrl.searchParams.get("code") ?? "";
    if (!code || code.length > 4096) return returnToApp("failed", returnOrigin);
    const clientId = callbackClientId(request.nextUrl.searchParams.get("client_id"), transaction.clientId);
    const { tokens, identity } = await exchangeAuthorizationCode(code, transaction, clientId);
    if (transaction.expectedSubject && transaction.expectedSubject !== identity.subject) return returnToApp("failed", returnOrigin);
    await db.query(`INSERT INTO chatgpt_plan_connections(user_id,client_id,subject,email,display_name,encrypted_credentials,scopes)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(user_id) DO UPDATE SET client_id=EXCLUDED.client_id,subject=EXCLUDED.subject,email=EXCLUDED.email,display_name=EXCLUDED.display_name,encrypted_credentials=EXCLUDED.encrypted_credentials,scopes=EXCLUDED.scopes,updated_at=now()`,
    [userId, clientId, identity.subject, identity.email, identity.name, encryptChatGPTSecret(userId, tokens satisfies ChatGPTTokens), tokens.scopes]);
    return returnToApp("connected", returnOrigin);
  } catch (error) {
    if (error instanceof Error && /plan usage|offline access/i.test(error.message)) return returnToApp("permission", returnOrigin);
    return returnToApp("failed", returnOrigin);
  }
}
