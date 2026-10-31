import { NextResponse } from "next/server";
import { currentUser } from "../../../../../../../lib/auth";
import { database } from "../../../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: "Film not found" }, 404);
    const result = await database().query(
      `SELECT r.run_id AS id,r.model,r.status,r.stage,r.error_code,r.created_at,r.updated_at,
              r.created_by,u.display_name AS created_by_name,(r.created_by=$2) AS can_resume
       FROM films f
       JOIN film_agent_runs r ON r.film_id=f.id
       JOIN users u ON u.id=r.created_by
       LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
       WHERE f.id=$1 AND (f.owner_id=$2 OR c.role='editor')
       ORDER BY r.updated_at DESC,r.created_at DESC LIMIT 20`, [id,user.id]);
    return json({ runs: result.rows });
  } catch { return json({ error: "Agent run history is unavailable" }, 503); }
}
