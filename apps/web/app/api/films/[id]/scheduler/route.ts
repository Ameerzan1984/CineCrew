import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { readSchedulerProgress } from "../../../../../lib/scheduler-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: "Film not found" }, 404);
    const membership = await database().query(`SELECT 1 FROM films f LEFT JOIN film_contributors c
      ON c.film_id=f.id AND c.user_id=$2 WHERE f.id=$1 AND (f.owner_id=$2 OR c.user_id=$2)`, [id, user.id]);
    if (!membership.rowCount) return json({ error: "Film not found" }, 404);
    const serviceUrl = process.env.GENERATION_SCHEDULER_URL;
    const serviceToken = process.env.GENERATION_SERVICE_TOKEN;
    if (!serviceUrl || !serviceToken) return json({ error: "Scheduler is not configured" }, 503);
    const progress = await readSchedulerProgress(serviceUrl, serviceToken, id, user.id);
    return json({ progress });
  } catch {
    return json({ error: "Scheduler progress is unavailable" }, 503);
  }
}
