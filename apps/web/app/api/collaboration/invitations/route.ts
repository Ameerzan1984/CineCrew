import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { database } from "../../../../lib/db";
import { allowedOrigin } from "../../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const result = await database().query(
      `SELECT i.film_id,i.role,i.created_at,f.title,f.genre,u.display_name AS invited_by_name
       FROM film_invitations i
       JOIN films f ON f.id=i.film_id
       JOIN users u ON u.id=i.invited_by
       WHERE i.user_id=$1 AND i.status='pending'
       ORDER BY i.created_at DESC`, [user.id]);
    return json({ invitations: result.rows });
  } catch { return json({ error: "Invitations are unavailable" }, 503); }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  const user = await currentUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  let input: { filmId?: unknown; action?: unknown };
  try { input = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (typeof input.filmId !== "string" || !uuid.test(input.filmId) || !["accept", "decline"].includes(String(input.action))) return json({ error: "Invalid invitation action" }, 400);

  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const film = await client.query("SELECT id FROM films WHERE id=$1 FOR SHARE", [input.filmId]);
    if (!film.rowCount) { await client.query("ROLLBACK"); return json({ error: "Invitation not found" }, 404); }
    const found = await client.query(
      "SELECT role,status FROM film_invitations WHERE film_id=$1 AND user_id=$2 FOR UPDATE", [input.filmId, user.id]);
    const invitation = found.rows[0];
    if (!invitation || invitation.status !== "pending") { await client.query("ROLLBACK"); return json({ error: "Invitation not found" }, 404); }
    if (input.action === "accept") {
      await client.query("INSERT INTO film_contributors(film_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(film_id,user_id) DO UPDATE SET role=EXCLUDED.role", [input.filmId, user.id, invitation.role]);
      await client.query("UPDATE film_invitations SET status='accepted',updated_at=now() WHERE film_id=$1 AND user_id=$2", [input.filmId, user.id]);
    } else {
      await client.query("UPDATE film_invitations SET status='declined',updated_at=now() WHERE film_id=$1 AND user_id=$2", [input.filmId, user.id]);
    }
    await client.query("COMMIT");
    return json({ accepted: input.action === "accept" });
  } catch { await client.query("ROLLBACK"); return json({ error: "Invitation could not be updated" }, 503); }
  finally { client.release(); }
}
