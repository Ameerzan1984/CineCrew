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
              (SELECT count(*)::integer FROM follows f WHERE f.followed_id=u.id) AS followers
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
    if (!input || typeof input !== "object" || Array.isArray(input) || !["follow", "unfollow"].includes(input.action) || typeof input.userId !== "string" || !uuid.test(input.userId)) return json({ error: "Invalid request" }, 400);
    const targetId = input.userId.toLowerCase();
    if (targetId === String(user.id).toLowerCase()) return json({ error: "You cannot follow yourself" }, 400);
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const target = await client.query("SELECT id FROM users WHERE id=$1 FOR KEY SHARE", [targetId]);
      if (!target.rowCount) { await client.query("ROLLBACK"); return json({ error: "User not found" }, 404); }
      if (input.action === "follow") {
        await client.query("INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [user.id, targetId]);
      } else {
        await client.query("DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2", [user.id, targetId]);
      }
      await client.query("COMMIT");
      return json({ following: input.action === "follow" });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Unable to update follow" }, 503);
  }
}
