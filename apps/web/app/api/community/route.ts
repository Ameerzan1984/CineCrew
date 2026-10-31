import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { allowedOrigin } from "../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const query = request.nextUrl.searchParams.get("q") ?? "";
    if (query.length > 100) return json({ error: "Search is too long" }, 400);
    const result = await database().query(
      `SELECT u.id,u.display_name,
              EXISTS (SELECT 1 FROM follows own WHERE own.follower_id=$1 AND own.followed_id=u.id) AS following,
              (SELECT count(*)::integer FROM follows f WHERE f.followed_id=u.id) AS followers,
              EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id=$1 AND b.blocked_id=u.id) AS blocked_by_me,
              EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id=u.id AND b.blocked_id=$1) AS blocked_you
       FROM users u WHERE u.id<>$1 AND position(lower($2) in lower(u.display_name))>0
       ORDER BY lower(u.display_name),u.id LIMIT 100`,
      [user.id, query.trim()],
    );
    return json({ users: result.rows });
  } catch { return json({ error: "Community directory unavailable" }, 503); }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const raw = await request.text();
    if (raw.length > 1024) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) || !["follow", "unfollow", "block", "unblock"].includes(input.action) || typeof input.userId !== "string" || !uuid.test(input.userId)) return json({ error: "Invalid request" }, 400);
    const targetId = input.userId.toLowerCase();
    if (targetId === String(user.id).toLowerCase()) return json({ error: "You cannot follow yourself" }, 400);
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const target = await client.query("SELECT id FROM users WHERE id=$1 FOR KEY SHARE", [targetId]);
      if (!target.rowCount) { await client.query("ROLLBACK"); return json({ error: "User not found" }, 404); }
      const [pairLow, pairHigh] = [String(user.id).toLowerCase(), targetId].sort();
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`direct-message:${pairLow}:${pairHigh}`]);
      if (input.action === "block") {
        await client.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [user.id, targetId]);
        await client.query("DELETE FROM follows WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)", [user.id, targetId]);
      } else if (input.action === "unblock") {
        await client.query("DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2", [user.id, targetId]);
      } else {
        const blocked = await client.query(
          "SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",
          [user.id, targetId],
        );
        if (blocked.rowCount) { await client.query("ROLLBACK"); return json({ error: "This relationship is unavailable" }, 403); }
      }
      if (input.action === "follow") {
        await client.query("INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [user.id, targetId]);
      } else if (input.action === "unfollow") {
        await client.query("DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2", [user.id, targetId]);
      }
      await client.query("COMMIT");
      if (input.action === "block" || input.action === "unblock") return json({ blocked_by_me: input.action === "block" });
      return json({ following: input.action === "follow" });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Unable to update follow" }, 503);
  }
}
