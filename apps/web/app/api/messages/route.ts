import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { allowedOrigin } from "../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

function orderedPair(left: string, right: string) {
  return [left.toLowerCase(), right.toLowerCase()].sort() as [string, string];
}

async function lockPair(client: PoolClient, left: string, right: string) {
  const [low, high] = orderedPair(left, right);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`direct-message:${low}:${high}`]);
  return [low, high] as const;
}

async function isBlocked(client: PoolClient, left: string, right: string) {
  const result = await client.query(
    "SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",
    [left, right],
  );
  return (result.rowCount ?? result.rows.length) > 0;
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof currentUser>>;
  try { user = await currentUser(); } catch { return json({ error: "Messages are unavailable" }, 503); }
  if (!user) return json({ error: "Sign in required" }, 401);

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(limitValue) ? Math.min(100, Math.max(1, limitValue)) : 50;
  if (conversationId && !uuid.test(conversationId)) return json({ error: "Invalid conversation" }, 400);

  try {
    if (conversationId) {
      const client = await database().connect();
      try {
        await client.query("BEGIN");
        const conversation = await client.query(
          `SELECT id,participant_low,participant_high FROM direct_conversations
           WHERE id=$1 AND (participant_low=$2 OR participant_high=$2)`,
          [conversationId, user.id],
        );
        const row = conversation.rows[0];
        if (!row) { await client.query("ROLLBACK"); return json({ error: "Conversation not found" }, 404); }
        await lockPair(client, row.participant_low, row.participant_high);
        if (await isBlocked(client, row.participant_low, row.participant_high)) {
          await client.query("ROLLBACK");
          return json({ error: "Messaging is unavailable for this conversation" }, 403);
        }
        const messages = await client.query(
          `SELECT id,sender_id,body,created_at FROM (
             SELECT id,sender_id,body,created_at FROM direct_messages
             WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200
           ) recent ORDER BY created_at,id`, [conversationId],
        );
        await client.query("COMMIT");
        return json({ conversation_id: conversationId, messages: messages.rows });
      } catch {
        await client.query("ROLLBACK");
        throw new Error("Conversation query failed");
      } finally { client.release(); }
    }

    const result = await database().query(
      `SELECT c.id AS conversation_id, other.id AS other_user_id, other.display_name AS other_display_name,
              c.last_message_at, latest.body AS last_message,
              (SELECT count(*)::integer FROM direct_messages unread
               WHERE unread.conversation_id=c.id AND unread.sender_id<>$1
                 AND (reads.read_at IS NULL OR unread.created_at>reads.read_at)) AS unread_count
       FROM direct_conversations c
       JOIN users other ON other.id=CASE WHEN c.participant_low=$1 THEN c.participant_high ELSE c.participant_low END
       LEFT JOIN direct_message_reads reads ON reads.conversation_id=c.id AND reads.user_id=$1
       LEFT JOIN LATERAL (
         SELECT m.body FROM direct_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1
       ) latest ON true
       WHERE (c.participant_low=$1 OR c.participant_high=$1)
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_id=c.participant_low AND b.blocked_id=c.participant_high)
              OR (b.blocker_id=c.participant_high AND b.blocked_id=c.participant_low)
         )
       ORDER BY c.last_message_at DESC,c.id DESC LIMIT $2`, [user.id, limit],
    );
    return json({ conversations: result.rows });
  } catch { return json({ error: "Messages are unavailable" }, 503); }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  let user: Awaited<ReturnType<typeof currentUser>>;
  try { user = await currentUser(); } catch { return json({ error: "Messages are unavailable" }, 503); }
  if (!user) return json({ error: "Sign in required" }, 401);

  let input: { action?: unknown; recipientId?: unknown; conversationId?: unknown; body?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 9000) return json({ error: "Request too large" }, 413);
    input = JSON.parse(raw);
  } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid request" }, 400);

  const client = await database().connect();
  try {
    await client.query("BEGIN");
    if (input.action === "read") {
      if (typeof input.conversationId !== "string" || !uuid.test(input.conversationId)) {
        await client.query("ROLLBACK"); return json({ error: "Choose a conversation" }, 400);
      }
      const conversation = await client.query(
        `SELECT id,participant_low,participant_high FROM direct_conversations
         WHERE id=$1 AND (participant_low=$2 OR participant_high=$2)`,
        [input.conversationId, user.id],
      );
      const row = conversation.rows[0];
      if (!row) { await client.query("ROLLBACK"); return json({ error: "Conversation not found" }, 404); }
      await lockPair(client, row.participant_low, row.participant_high);
      if (await isBlocked(client, row.participant_low, row.participant_high)) {
        await client.query("ROLLBACK"); return json({ error: "Messaging is unavailable for this conversation" }, 403);
      }
      await client.query(
        `INSERT INTO direct_message_reads(conversation_id,user_id,read_at) VALUES($1,$2,now())
         ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=excluded.read_at`,
        [row.id, user.id],
      );
      await client.query("COMMIT");
      return json({ conversation_id: row.id, read: true });
    }

    if (input.action !== "send" || typeof input.recipientId !== "string" || !uuid.test(input.recipientId) ||
        typeof input.body !== "string" || !input.body.trim() || input.body.length > 4000) {
      await client.query("ROLLBACK"); return json({ error: "Enter a message of up to 4,000 characters" }, 400);
    }
    const recipientId = input.recipientId.toLowerCase();
    if (recipientId === String(user.id).toLowerCase()) {
      await client.query("ROLLBACK"); return json({ error: "You cannot message yourself" }, 400);
    }
    const [low, high] = await lockPair(client, user.id, recipientId);
    const recipient = await client.query("SELECT id FROM users WHERE id=$1", [recipientId]);
    if (!recipient.rowCount) { await client.query("ROLLBACK"); return json({ error: "User not found" }, 404); }
    if (await isBlocked(client, user.id, recipientId)) {
      await client.query("ROLLBACK"); return json({ error: "Messaging is unavailable for this user" }, 403);
    }
    const conversation = await client.query(
      `INSERT INTO direct_conversations(id,participant_low,participant_high) VALUES($1,$2,$3)
       ON CONFLICT(participant_low,participant_high) DO UPDATE SET participant_low=excluded.participant_low
       RETURNING id`, [randomUUID(), low, high],
    );
    const conversationId = conversation.rows[0].id as string;
    const message = await client.query(
      `INSERT INTO direct_messages(id,conversation_id,sender_id,body)
       VALUES($1,$2,$3,$4) RETURNING id,sender_id,body,created_at`,
      [randomUUID(), conversationId, user.id, input.body.trim()],
    );
    await client.query("UPDATE direct_conversations SET last_message_at=$2 WHERE id=$1", [conversationId, message.rows[0].created_at]);
    await client.query(
      `INSERT INTO direct_message_reads(conversation_id,user_id,read_at) VALUES($1,$2,$3)
       ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=excluded.read_at`,
      [conversationId, user.id, message.rows[0].created_at],
    );
    await client.query("COMMIT");
    return json({ conversation_id: conversationId, message: message.rows[0] }, 201);
  } catch {
    await client.query("ROLLBACK");
    return json({ error: "Message could not be saved" }, 503);
  } finally { client.release(); }
}
