import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../../lib/auth";
import { database } from "../../../../../../lib/db";
import { allowedOrigin } from "../../../../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string }> };

/** Authenticated, non-generating price check. No quote means no later submission. */
export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId } = await context.params;
    if (!uuid.test(filmId)) return json({ error: "Film not found" }, 404);
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw) as { sceneId?: unknown; requestKey?: unknown; referenceGenerationId?: unknown };
    if (!uuid.test(typeof input.sceneId === "string" ? input.sceneId : "") ||
        !uuid.test(typeof input.requestKey === "string" ? input.requestKey : "") ||
        (input.referenceGenerationId !== undefined && input.referenceGenerationId !== null && !uuid.test(typeof input.referenceGenerationId === "string" ? input.referenceGenerationId : ""))) {
      return json({ error: "Invalid price estimate request" }, 400);
    }

    const result = await database().query(`SELECT f.owner_id,CASE WHEN f.owner_id=$3 THEN 'owner' ELSE c.role END AS role,
        s.id AS scene_id,s.created_by,pc.user_id AS provider_user_id
      FROM films f JOIN scenes s ON s.film_id=f.id
      LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$3
      LEFT JOIN provider_connections pc ON pc.user_id=$3 AND pc.provider='higgsfield-api'
      WHERE f.id=$1 AND s.id=$2 AND (f.owner_id=$3 OR c.user_id=$3)`, [filmId,input.sceneId,user.id]);
    if (!result.rowCount) return json({ error: "Scene unavailable" }, 404);
    const scene = result.rows[0];
    if (!(scene.role === "owner" || scene.role === "editor")) return json({ error: "Editor access required" }, 403);
    if (scene.created_by !== user.id) return json({ error: "Only the shot contributor can estimate and spend with their own Higgsfield API account" }, 403);
    if (!scene.provider_user_id) return json({ error: "Save your own Higgsfield API key in Connections first" }, 409);
    // Higgsfield confirms that a pre-generation estimate exists, but does not
    // publish the exact REST route and USD response contract for this model.
    // Do not issue a speculative request, create a quote token, or allow a paid
    // generation until that contract can be verified from an authoritative source.
    return json({ error: "HIGGSFIELD_PRICE_ESTIMATE_UNVERIFIED" }, 503);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not prepare a Higgsfield estimate" }, 503);
  }
}
