import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { allowedOrigin } from "../../../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: "Film not found" }, 404);
    const db = database();
    const access = await db.query(
      `SELECT f.owner_id,CASE WHEN f.owner_id=$2 THEN 'owner' ELSE c.role END AS role
       FROM films f LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
       WHERE f.id=$1 AND (f.owner_id=$2 OR c.user_id=$2)`, [id, user.id]);
    if (!access.rowCount) return json({ error: "Film not found" }, 404);
    const collaborators = await db.query(
      `SELECT c.user_id,c.role,c.created_at,u.display_name
       FROM film_contributors c JOIN users u ON u.id=c.user_id
       WHERE c.film_id=$1 ORDER BY u.display_name`, [id]);
    const pending = access.rows[0].role === "owner" ? await db.query(
      `SELECT i.user_id,i.role,i.created_at,u.display_name
       FROM film_invitations i JOIN users u ON u.id=i.user_id
       WHERE i.film_id=$1 AND i.status='pending' ORDER BY i.created_at`, [id]) : { rows: [] };
    return json({ role: access.rows[0].role, collaborators: collaborators.rows, invitations: pending.rows });
  } catch { return json({ error: "Collaborators are unavailable" }, 503); }
}

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId } = await context.params;
    if (!uuid.test(filmId)) return json({ error: "Film not found" }, 404);
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid request" }, 400);
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const film = await client.query("SELECT owner_id,mode FROM films WHERE id=$1 FOR UPDATE", [filmId]);
      if (!film.rowCount || film.rows[0].owner_id !== user.id) { await client.query("ROLLBACK"); return json({ error: "Film not found" }, 404); }
      if (input.action === "invite") {
        const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
        const role = input.role === "viewer" ? "viewer" : input.role === "editor" ? "editor" : "";
        if (film.rows[0].mode !== "collaborative") { await client.query("ROLLBACK"); return json({ error: "Enable collaborative mode before inviting contributors" }, 409); }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) { await client.query("ROLLBACK"); return json({ error: "Enter a valid account email and role" }, 400); }
        const invitee = await client.query("SELECT id FROM users WHERE email=$1", [email]);
        if (!invitee.rowCount || invitee.rows[0].id === user.id) { await client.query("ROLLBACK"); return json({ error: "An eligible CineMesh account was not found" }, 404); }
        const member = await client.query("SELECT 1 FROM film_contributors WHERE film_id=$1 AND user_id=$2", [filmId, invitee.rows[0].id]);
        if (member.rowCount) { await client.query("ROLLBACK"); return json({ error: "This account is already a collaborator" }, 409); }
        await client.query(
          `INSERT INTO film_invitations(film_id,user_id,invited_by,role,status)
           VALUES($1,$2,$3,$4,'pending')
           ON CONFLICT(film_id,user_id) DO UPDATE SET invited_by=EXCLUDED.invited_by,role=EXCLUDED.role,status='pending',updated_at=now()`,
          [filmId, invitee.rows[0].id, user.id, role]);
        await client.query("COMMIT");
        return json({ invited: true }, 201);
      }
      if (input.action === "remove" && typeof input.userId === "string" && uuid.test(input.userId)) {
        await client.query("DELETE FROM film_contributors WHERE film_id=$1 AND user_id=$2", [filmId, input.userId]);
        await client.query("UPDATE film_invitations SET status='revoked',updated_at=now() WHERE film_id=$1 AND user_id=$2", [filmId, input.userId]);
        await client.query("COMMIT");
        return json({ removed: true });
      }
      await client.query("ROLLBACK");
      return json({ error: "Unknown collaborator action" }, 400);
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string })?.code === "23505") return json({ error: "An invitation already exists" }, 409);
      throw error;
    } finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Collaborator action could not be completed" }, 503);
  }
}
