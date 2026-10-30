import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { allowedOrigin } from "../../../../../lib/origin";
import { assembleVideoAssets } from "../../../../../lib/video-assembly";
import { removeStoredFile } from "../../../../../lib/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId } = await context.params;
    if (!uuid.test(filmId)) return json({ error: "Film not found" }, 404);
    const raw = await request.text();
    if (raw.length > 8192) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) || !Array.isArray(input.generationIds) ||
        input.generationIds.length < 2 || input.generationIds.length > 100 ||
        input.generationIds.some((id: unknown) => typeof id !== "string" || !uuid.test(id)) ||
        new Set(input.generationIds).size !== input.generationIds.length) return json({ error: "Choose between 2 and 100 different saved shot videos" }, 400);

    const db = database();
    const membership = await db.query(`SELECT CASE WHEN f.owner_id=$2 THEN 'owner' ELSE c.role END AS role
      FROM films f LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
      WHERE f.id=$1 AND (f.owner_id=$2 OR c.user_id=$2)`, [filmId,user.id]);
    if (!membership.rowCount) return json({ error: "Film not found" }, 404);
    if (!(membership.rows[0].role === "owner" || membership.rows[0].role === "editor")) return json({ error: "Editor access required" }, 403);

    const selected = await db.query(`SELECT j.id AS generation_id,j.scene_id,s.position,
        a.storage_key,a.size_bytes
      FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id
      JOIN media_assets a ON a.generation_job_id=j.id AND a.kind='generation_clip'
      WHERE j.film_id=$1 AND j.id=ANY($2::uuid[]) AND j.status='completed'
      ORDER BY s.position,j.created_at,a.created_at`, [filmId,input.generationIds]);
    if (selected.rowCount !== input.generationIds.length) return json({ error: "Save every completed shot to CineMesh before assembling" }, 409);
    if (new Set(selected.rows.map(row => row.scene_id)).size !== selected.rows.length) return json({ error: "Choose only one saved generation per scene" }, 409);

    const renderId = randomUUID();
    let rendered: Awaited<ReturnType<typeof assembleVideoAssets>> | undefined;
    try {
      rendered = await assembleVideoAssets(filmId,renderId,selected.rows.map(row => ({ storageKey: row.storage_key, sizeBytes: Number(row.size_bytes) })));
      const inserted = await db.query(`INSERT INTO media_assets(id,film_id,kind,storage_key,mime_type,size_bytes,sha256,created_by)
        VALUES($1,$2,'film_render',$3,'video/mp4',$4,$5,$6)
        RETURNING id,size_bytes,sha256,created_at`, [renderId,filmId,rendered.storageKey,rendered.sizeBytes,rendered.sha256,user.id]);
      return json({ render: inserted.rows[0] }, 201);
    } catch (error) {
      if (rendered) await removeStoredFile(rendered.storageKey);
      const message = error instanceof Error ? error.message : "Render worker failed";
      return json({ error: message }, 502);
    }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not assemble this film" }, 503);
  }
}
