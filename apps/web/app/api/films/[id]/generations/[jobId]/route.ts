import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../../lib/auth";
import { database } from "../../../../../../lib/db";
import { allowedOrigin } from "../../../../../../lib/origin";
import { decryptProviderCredentials } from "../../../../../../lib/provider-vault";
import { HiggsfieldApiClient, HiggsfieldHttpError } from "../../../../../../../../packages/providers/src/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string; jobId: string }> };

function shape(row: Record<string, unknown>, userId: string) {
  return {
    id: row.id, film_id: row.film_id, scene_id: row.scene_id, scene_title: row.scene_title,
    contributor_id: row.contributor_id, contributor_name: row.contributor_name,
    mine: row.contributor_id === userId, model_path: row.model_path, prompt: row.prompt,
    duration_seconds: row.duration_seconds, status: row.status, provider_request_id: row.provider_request_id,
    video_url: row.video_url, video_expires_at: row.video_expires_at,
    media_asset_id: row.media_asset_id ?? null, media_size_bytes: row.media_size_bytes ?? null,
    last_error_code: row.last_error_code, created_at: row.created_at, updated_at: row.updated_at,
  };
}

async function getRow(filmId: string, jobId: string, userId: string) {
  return database().query(`SELECT j.*,a.id AS media_asset_id,a.size_bytes AS media_size_bytes,s.title AS scene_title,u.display_name AS contributor_name
    FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id JOIN users u ON u.id=j.contributor_id
    LEFT JOIN media_assets a ON a.generation_job_id=j.id AND a.kind='generation_clip'
    WHERE j.id=$1 AND j.film_id=$2 AND EXISTS(SELECT 1 FROM films f LEFT JOIN film_contributors c
      ON c.film_id=f.id AND c.user_id=$3 WHERE f.id=$2 AND (f.owner_id=$3 OR c.user_id=$3))`, [jobId,filmId,userId]);
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId, jobId } = await context.params;
    if (!uuid.test(filmId) || !uuid.test(jobId)) return json({ error: "Generation job not found" }, 404);
    const db = database();
    const found = await getRow(filmId,jobId,user.id);
    if (!found.rowCount) return json({ error: "Generation job not found" }, 404);
    let row = found.rows[0];
    // Only the contributor who owns this API connection may spend it to poll the provider.
    const canPoll = row.contributor_id === user.id && !!row.provider_request_id && ["queued","in_progress"].includes(row.status);
    if (!canPoll) return json(shape(row,user.id));
    const credentialsRow = await db.query("SELECT encrypted_credentials FROM provider_connections WHERE user_id=$1 AND provider='higgsfield-api'", [user.id]);
    const ciphertext = credentialsRow.rows[0]?.encrypted_credentials;
    if (!ciphertext) return json({ ...shape(row,user.id), poll_error: "Reconnect this contributor's Higgsfield API key to continue polling." });
    try {
      const provider = new HiggsfieldApiClient(decryptProviderCredentials(user.id,ciphertext));
      const requestId = row.provider_request_id as string;
      const root = `https://api.higgsfield.ai/requests/${requestId}`;
      const result = await provider.status({ requestId, statusUrl: `${root}/status`, cancelUrl: `${root}/cancel` });
      await db.query("UPDATE provider_connections SET verified_at=now(),updated_at=now() WHERE user_id=$1 AND provider='higgsfield-api' AND encrypted_credentials=$2", [user.id,ciphertext]);
      const saved = await db.query(`UPDATE scene_generation_jobs SET status=$2,video_url=$3,video_expires_at=$4,last_error_code=NULL,updated_at=now()
        WHERE id=$1 RETURNING *`, [jobId,result.status,result.outputs.find(output => output.kind === "video")?.url ?? null,result.expiresAt]);
      row = saved.rows[0];
    } catch (error) {
      const errorCode = error instanceof HiggsfieldHttpError ? `provider_${error.status}` : "provider_poll_failed";
      await db.query("UPDATE scene_generation_jobs SET last_error_code=$2,updated_at=now() WHERE id=$1", [jobId,errorCode]);
      if (error instanceof HiggsfieldHttpError && error.status === 401) await db.query("UPDATE provider_connections SET verified_at=NULL,updated_at=now() WHERE user_id=$1 AND provider='higgsfield-api' AND encrypted_credentials=$2", [user.id,ciphertext]);
      return json({ ...shape(row,user.id), poll_error: error instanceof HiggsfieldHttpError ? `Higgsfield returned HTTP ${error.status}.` : "Could not refresh the provider status." });
    }
    const refreshed = await getRow(filmId,jobId,user.id);
    return json(shape(refreshed.rows[0],user.id));
  } catch { return json({ error: "Generation status unavailable" }, 503); }
}

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId, jobId } = await context.params;
    if (!uuid.test(filmId) || !uuid.test(jobId)) return json({ error: "Generation job not found" }, 404);
    const raw = await request.text();
    if (raw.length > 1024) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (input?.action !== "confirm_not_submitted") return json({ error: "Unknown action" }, 400);
    const result = await database().query(`UPDATE scene_generation_jobs j SET status='failed',last_error_code='contributor_confirmed_no_provider_request',updated_at=now()
      WHERE j.id=$1 AND j.film_id=$2 AND j.contributor_id=$3 AND j.status='uncertain' AND j.provider_request_id IS NULL
      AND EXISTS(SELECT 1 FROM films f LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$3
        WHERE f.id=$2 AND (f.owner_id=$3 OR c.user_id=$3)) RETURNING j.id`, [jobId,filmId,user.id]);
    if (!result.rowCount) return json({ error: "Only the shot contributor can resolve an uncertain request, and the job must have no provider request ID" }, 409);
    return json({ resolved: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not resolve this generation request" }, 503);
  }
}
