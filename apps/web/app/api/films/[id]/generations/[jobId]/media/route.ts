import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../../../lib/auth";
import { database } from "../../../../../../../lib/db";
import { allowedOrigin } from "../../../../../../../lib/origin";
import { persistProviderVideo, removeStoredFile } from "../../../../../../../lib/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string; jobId: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId, jobId } = await context.params;
    if (!uuid.test(filmId) || !uuid.test(jobId)) return json({ error: "Generation job not found" }, 404);
    const db = database();
    const found = await db.query(`SELECT j.id,j.film_id,j.scene_id,j.status,j.video_url,
        CASE WHEN f.owner_id=$3 THEN 'owner' ELSE c.role END AS role
      FROM scene_generation_jobs j JOIN films f ON f.id=j.film_id
      LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$3
      WHERE j.id=$1 AND j.film_id=$2 AND (f.owner_id=$3 OR c.user_id=$3)`, [jobId,filmId,user.id]);
    if (!found.rowCount) return json({ error: "Generation job not found" }, 404);
    const job = found.rows[0];
    if (!(job.role === "owner" || job.role === "editor")) return json({ error: "Editor access required" }, 403);
    if (job.status !== "completed" || typeof job.video_url !== "string") return json({ error: "The provider has not returned a completed video" }, 409);
    const existing = await db.query("SELECT id,size_bytes,sha256 FROM media_assets WHERE generation_job_id=$1", [jobId]);
    if (existing.rowCount) return json({ asset: existing.rows[0], alreadySaved: true });

    let saved: Awaited<ReturnType<typeof persistProviderVideo>> | undefined;
    try {
      saved = await persistProviderVideo(job.video_url,filmId,jobId);
      const inserted = await db.query(`INSERT INTO media_assets(id,film_id,scene_id,generation_job_id,kind,storage_key,mime_type,size_bytes,sha256,created_by)
        VALUES($1,$2,$3,$4,'generation_clip',$5,$6,$7,$8,$9)
        ON CONFLICT(generation_job_id) DO NOTHING
        RETURNING id,size_bytes,sha256`, [saved.id,filmId,job.scene_id,jobId,saved.storageKey,saved.mimeType,saved.sizeBytes,saved.sha256,user.id]);
      if (!inserted.rowCount) {
        await removeStoredFile(saved.storageKey);
        const prior = await db.query("SELECT id,size_bytes,sha256 FROM media_assets WHERE generation_job_id=$1", [jobId]);
        if (prior.rowCount) return json({ asset: prior.rows[0], alreadySaved: true });
        return json({ error: "The saved video record could not be confirmed" }, 503);
      }
      return json({ asset: inserted.rows[0], alreadySaved: false }, 201);
    } catch (error) {
      if (saved) await removeStoredFile(saved.storageKey);
      return json({ error: error instanceof Error ? error.message : "Could not save this video to CineMesh" }, 502);
    }
  } catch { return json({ error: "Could not save the completed video" }, 503); }
}
