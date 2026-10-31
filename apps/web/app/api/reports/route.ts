import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { allowedOrigin } from "../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categories = new Set(["harassment", "spam", "copyright", "inappropriate", "other"]);
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        !["user", "film"].includes(input.targetType) || typeof input.targetId !== "string" || !uuid.test(input.targetId) ||
        typeof input.category !== "string" || !categories.has(input.category) ||
        (input.details !== undefined && typeof input.details !== "string")) return json({ error: "Invalid report" }, 400);
    const targetId = input.targetId.toLowerCase();
    const details = typeof input.details === "string" ? input.details.trim() : "";
    if (details.length > 2000) return json({ error: "Report details are too long" }, 400);
    if (input.targetType === "user" && targetId === String(user.id).toLowerCase()) return json({ error: "You cannot report yourself" }, 400);

    const db = database();
    const target = input.targetType === "user"
      ? await db.query("SELECT id FROM users WHERE id=$1", [targetId])
      : await db.query(`SELECT f.id FROM films f WHERE f.id=$1 AND (
          (f.status='published' AND f.moderation_hidden_at IS NULL AND EXISTS (SELECT 1 FROM media_assets a WHERE a.film_id=f.id AND a.kind='film_render'))
          OR f.owner_id=$2 OR EXISTS (SELECT 1 FROM film_contributors c WHERE c.film_id=f.id AND c.user_id=$2)
        )`, [targetId, user.id]);
    if (!target.rowCount) return json({ error: "Report target not found" }, 404);

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`moderation-report:${user.id}`]);
      const recent = await client.query("SELECT count(*)::integer AS count FROM moderation_reports WHERE reporter_id=$1 AND created_at>now()-interval '24 hours'", [user.id]);
      if (recent.rows[0].count >= 10) { await client.query("ROLLBACK"); return json({ error: "Report limit reached; try again later" }, 429); }
      const result = await client.query(
        `INSERT INTO moderation_reports(id,reporter_id,target_type,target_id,category,details)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT (reporter_id,target_type,target_id) WHERE status IN ('open','reviewed') DO NOTHING
         RETURNING id,status,created_at`,
        [randomUUID(), user.id, input.targetType, targetId, input.category, details],
      );
      if (!result.rowCount) { await client.query("ROLLBACK"); return json({ error: "You already have an active report for this target" }, 409); }
      await client.query("COMMIT");
      return json({ report: result.rows[0] }, 201);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not submit report" }, 503);
  }
}
