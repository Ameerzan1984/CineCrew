import { database } from "./db";
import { decryptChatGPTSecret, encryptChatGPTSecret } from "./chatgpt-vault";
import { ChatGPTTokens, refreshChatGPTTokens } from "./chatgpt-plan-oauth";

export async function chatGPTAccessToken(userId: string): Promise<string> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT client_id,encrypted_credentials,scopes FROM chatgpt_plan_connections WHERE user_id=$1 FOR UPDATE", [userId]);
    const row = found.rows[0];
    if (!row) throw new Error("Connect a ChatGPT account first");
    if (!row.scopes.includes("chatgpt.tokens.use.direct")) throw new Error("ChatGPT plan usage was not authorized");
    const saved = decryptChatGPTSecret<ChatGPTTokens>(userId, row.encrypted_credentials);
    if (saved.expires_at > Date.now() + 60_000) {
      await client.query("COMMIT");
      return saved.access_token;
    }
    const refreshed = await refreshChatGPTTokens(row.client_id, saved.refresh_token);
    const next: ChatGPTTokens = {
      ...saved,
      ...refreshed,
      id_token: refreshed.id_token ?? saved.id_token,
      scopes: refreshed.scopes?.length ? refreshed.scopes : saved.scopes,
    };
    if (!next.scopes.includes("chatgpt.tokens.use.direct")) throw new Error("ChatGPT plan usage permission is no longer available; reconnect the account");
    await client.query("UPDATE chatgpt_plan_connections SET encrypted_credentials=$2,scopes=$3,updated_at=now() WHERE user_id=$1", [userId, encryptChatGPTSecret(userId, next), next.scopes]);
    await client.query("COMMIT");
    return next.access_token;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally { client.release(); }
}
