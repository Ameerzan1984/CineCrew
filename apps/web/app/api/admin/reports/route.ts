import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { isCineMeshAdmin } from "../../../../lib/admin";
import { database } from "../../../../lib/db";
import { allowedOrigin } from "../../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function requireAdmin() {
  const user = await currentUser();
  if (!user) return { response: json({ error: "Sign in required" }, 401) } as const;
  if (!isCineMeshAdmin(user.email)) return { response: json({ error: "Admin access required" }, 403) } as const;
  return { user } as const;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    const status = request.nextUrl.searchParams.get("status") ?? "open";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    if (!(["open", "reviewed", "dismissed", "actioned", "all"].includes(status)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return json({ error: "Invalid moderation filter" }, 400);
    }
    const result = await database().query(
      `SELECT r.id,r.reporter_id,r.target_type,r.target_id,r.category,r.details,r.status,r.created_at,r.updated_at,r.closed_at,
              reporter.display_name AS reporter_display_name,
              CASE WHEN r.target_type='film' THEN f.title ELSE reported_user.display_name END AS target_name,
              CASE WHEN r.target_type='film' THEN f.status ELSE NULL END AS film_status,
              (f.moderation_hidden_at IS NOT NULL) AS film_hidden,
              COALESCE((SELECT json_agg(json_build_object(
                'id',a.id,'action',a.action,'note',a.note,'created_at',a.created_at,'actor_display_name',actor.display_name
              ) ORDER BY a.created_at DESC,a.id DESC) FROM moderation_actions a JOIN users actor ON actor.id=a.actor_id WHERE a.report_id=r.id),'[]'::json) AS actions
       FROM moderation_reports r
       JOIN users reporter ON reporter.id=r.reporter_id
       LEFT JOIN films f ON r.target_type='film' AND f.id=r.target_id
       LEFT JOIN users reported_user ON r.target_type='user' AND reported_user.id=r.target_id
       WHERE ($1='all' OR r.status=$1)
       ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewed' THEN 1 ELSE 2 END,r.created_at ASC,r.id ASC
       LIMIT $2`, [status, limit]);
    return json({ reports: result.rows, count: result.rowCount });
  } catch { return json({ error: "Moderation queue is unavailable" }, 503); }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.reportId !== "string" || !uuid.test(input.reportId) ||
        !["dismiss", "hide_film", "restore_film"].includes(input.action) || (input.note !== undefined && typeof input.note !== "string")) return json({ error: "Invalid moderation action" }, 400);
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (note.length > 1000) return json({ error: "Moderation note is too long" }, 400);
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const report = await client.query("SELECT id,target_type,target_id,status FROM moderation_reports WHERE id=$1 FOR UPDATE", [input.reportId]);
      if (!report.rowCount) { await client.query("ROLLBACK"); return json({ error: "Report not found" }, 404); }
      const current = report.rows[0] as { id: string; target_type: string; target_id: string; status: string };
      if (input.action === "dismiss") {
        if (!["open", "reviewed"].includes(current.status)) { await client.query("ROLLBACK"); return json({ error: "This report is already closed" }, 409); }
        await client.query("UPDATE moderation_reports SET status='dismissed',reviewed_by=$2,updated_at=now(),closed_at=now() WHERE id=$1", [current.id, auth.user.id]);
      } else {
        if (current.target_type !== "film") { await client.query("ROLLBACK"); return json({ error: "This action only applies to film reports" }, 400); }
        if (input.action === "hide_film") {
          if (!["open", "reviewed"].includes(current.status)) { await client.query("ROLLBACK"); return json({ error: "This report is already closed" }, 409); }
          const target = await client.query("SELECT id,moderation_hidden_at FROM films WHERE id=$1 FOR UPDATE", [current.target_id]);
          if (!target.rowCount) { await client.query("ROLLBACK"); return json({ error: "Reported film no longer exists" }, 404); }
          if (target.rows[0].moderation_hidden_at) { await client.query("ROLLBACK"); return json({ error: "This film already has an active moderation restriction" }, 409); }
          const hidden = await client.query(`UPDATE films SET moderation_hidden_at=now(),moderation_hidden_by=$2,moderation_report_id=$3,updated_at=now()
            WHERE id=$1 RETURNING id`, [current.target_id, auth.user.id, current.id]);
          if (!hidden.rowCount) { await client.query("ROLLBACK"); return json({ error: "Reported film no longer exists" }, 404); }
          await client.query("UPDATE moderation_reports SET status='actioned',reviewed_by=$2,updated_at=now(),closed_at=now() WHERE id=$1", [current.id, auth.user.id]);
        } else {
          if (current.status !== "actioned") { await client.query("ROLLBACK"); return json({ error: "This report has no active film restriction" }, 409); }
          const restored = await client.query(`UPDATE films SET moderation_hidden_at=NULL,moderation_hidden_by=NULL,moderation_report_id=NULL,updated_at=now()
            WHERE id=$1 AND moderation_report_id=$2 RETURNING id`, [current.target_id, current.id]);
          if (!restored.rowCount) { await client.query("ROLLBACK"); return json({ error: "The film restriction has since changed" }, 409); }
          await client.query("UPDATE moderation_reports SET status='reviewed',reviewed_by=$2,updated_at=now(),closed_at=NULL WHERE id=$1", [current.id, auth.user.id]);
        }
      }
      await client.query("INSERT INTO moderation_actions(id,report_id,actor_id,action,note) VALUES($1,$2,$3,$4,$5)", [randomUUID(), current.id, auth.user.id, input.action, note]);
      await client.query("COMMIT");
      return json({ reportId: current.id, status: input.action === "dismiss" ? "dismissed" : input.action === "hide_film" ? "actioned" : "reviewed" });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not apply moderation action" }, 503);
  }
}
