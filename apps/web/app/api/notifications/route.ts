import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { allowedOrigin } from "../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const limit = Number.isInteger(limitValue) ? Math.min(100, Math.max(1, limitValue)) : 50;
    const result = await database().query(
      `SELECT n.id,n.notification_type,n.role,n.created_at,n.read_at,n.film_id,
              f.title AS film_title,a.display_name AS actor_display_name,
              (SELECT count(*)::integer FROM notifications unread
               WHERE unread.recipient_id=$1 AND unread.read_at IS NULL) AS unread_count
       FROM notifications n
       JOIN films f ON f.id=n.film_id
       LEFT JOIN users a ON a.id=n.actor_id
       WHERE n.recipient_id=$1
       ORDER BY n.created_at DESC,n.id DESC
       LIMIT $2`, [user.id,limit]);
    return json({ notifications: result.rows, unread_count: result.rows[0]?.unread_count ?? 0 });
  } catch { return json({ error: "Notifications are unavailable" }, 503); }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  let user: Awaited<ReturnType<typeof currentUser>>;
  try { user = await currentUser(); } catch { return json({ error: "Notifications are unavailable" }, 503); }
  if (!user) return json({ error: "Sign in required" }, 401);
  let input: { notificationId?: unknown; action?: unknown };
  try { input = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input) || input.action !== "read" || typeof input.notificationId !== "string" || !uuid.test(input.notificationId)) {
    return json({ error: "Choose a notification to mark as read" }, 400);
  }
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const prior = await client.query(
      "SELECT read_at FROM notifications WHERE id=$1 AND recipient_id=$2 FOR UPDATE", [input.notificationId,user.id]);
    if (!prior.rows[0]) { await client.query("ROLLBACK"); return json({ error: "Notification not found" }, 404); }
    const changed = prior.rows[0].read_at === null;
    const readAt = changed
      ? (await client.query("UPDATE notifications SET read_at=now() WHERE id=$1 AND recipient_id=$2 RETURNING read_at", [input.notificationId,user.id])).rows[0].read_at
      : prior.rows[0].read_at;
    const unread = await client.query("SELECT count(*)::integer AS count FROM notifications WHERE recipient_id=$1 AND read_at IS NULL", [user.id]);
    await client.query("COMMIT");
    return json({ id: input.notificationId, read_at: readAt, unread_count: unread.rows[0].count, read: true, changed });
  } catch {
    await client.query("ROLLBACK");
    return json({ error: "Notification could not be updated" }, 503);
  } finally { client.release(); }
}
