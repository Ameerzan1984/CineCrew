import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { allowedOrigin } from "../../../../../lib/origin";
import { decryptProviderCredentials } from "../../../../../lib/provider-vault";
import { HiggsfieldApiClient, HiggsfieldHttpError, HIGGSFIELD_SEEDANCE_25_MODEL, HIGGSFIELD_SEEDANCE_25_REFERENCE_MODEL, ProviderUnavailableError, seedance25Input, seedance25ReferenceInput } from "../../../../../../../packages/providers/src/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string }> };

function publicJob(row: Record<string, unknown>, userId: string) {
  return {
    id: row.id, film_id: row.film_id, scene_id: row.scene_id, scene_title: row.scene_title,
    contributor_id: row.contributor_id, contributor_name: row.contributor_name,
    mine: row.contributor_id === userId, model_path: row.model_path, prompt: row.prompt,
    duration_seconds: row.duration_seconds, status: row.status, provider_request_id: row.provider_request_id,
    video_url: row.video_url, video_expires_at: row.video_expires_at,
    media_asset_id: row.media_asset_id ?? null, media_size_bytes: row.media_size_bytes ?? null,
    reference_generation_job_id: row.reference_generation_job_id ?? null,
    last_error_code: row.last_error_code, created_at: row.created_at, updated_at: row.updated_at,
  };
}

async function readJobs(filmId: string, userId: string) {
  const result = await database().query(`SELECT j.*,a.id AS media_asset_id,a.size_bytes AS media_size_bytes,s.title AS scene_title,u.display_name AS contributor_name
    FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id JOIN users u ON u.id=j.contributor_id
    LEFT JOIN media_assets a ON a.generation_job_id=j.id AND a.kind='generation_clip'
    WHERE j.film_id=$1 AND EXISTS(SELECT 1 FROM films f LEFT JOIN film_contributors c
      ON c.film_id=f.id AND c.user_id=$2 WHERE f.id=$1 AND (f.owner_id=$2 OR c.user_id=$2))
    ORDER BY s.position,j.created_at DESC LIMIT 200`, [filmId,userId]);
  return result.rows.map(row => publicJob(row, userId));
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: "Film not found" }, 404);
    const visible = await database().query(`SELECT 1 FROM films f LEFT JOIN film_contributors c
      ON c.film_id=f.id AND c.user_id=$2 WHERE f.id=$1 AND (f.owner_id=$2 OR c.user_id=$2)`, [id,user.id]);
    if (!visible.rowCount) return json({ error: "Film not found" }, 404);
    await database().query(`UPDATE scene_generation_jobs SET status='uncertain',last_error_code='submission_response_missing',updated_at=now()
      WHERE film_id=$1 AND status='submitting' AND provider_request_id IS NULL AND created_at < now()-interval '3 minutes'`, [id]);
    const rows = await readJobs(id, user.id);
    return json({ jobs: rows });
  } catch { return json({ error: "Generation jobs unavailable" }, 503); }
}

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId } = await context.params;
    if (!uuid.test(filmId)) return json({ error: "Film not found" }, 404);
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) || !uuid.test(input.sceneId ?? "") || !uuid.test(input.requestKey ?? "") ||
        (input.referenceGenerationId !== undefined && input.referenceGenerationId !== null && !uuid.test(input.referenceGenerationId))) return json({ error: "Invalid generation request" }, 400);

    const db = database();
    const client = await db.connect();
    let jobId: string;
    let prompt: string;
    let modelPath: string;
    let generationInput: Record<string, unknown>;
    let referenceGenerationId: string | null = null;
    let encrypted: string;
    let credentials: ReturnType<typeof decryptProviderCredentials>;
    try {
      await client.query("BEGIN");
      const access = await client.query(`SELECT f.owner_id,CASE WHEN f.owner_id=$3 THEN 'owner' ELSE c.role END AS role,
          s.id AS scene_id,s.created_by,s.title,s.description,pc.encrypted_credentials
        FROM films f JOIN scenes s ON s.film_id=f.id
        LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$3
        LEFT JOIN provider_connections pc ON pc.user_id=$3 AND pc.provider='higgsfield-api'
        WHERE f.id=$1 AND s.id=$2 AND (f.owner_id=$3 OR c.user_id=$3) FOR UPDATE OF f,s`, [filmId,input.sceneId,user.id]);
      if (!access.rowCount) { await client.query("ROLLBACK"); return json({ error: "Scene unavailable" }, 404); }
      const scene = access.rows[0];
      if (!(scene.role === "owner" || scene.role === "editor")) { await client.query("ROLLBACK"); return json({ error: "Editor access required" }, 403); }
      // Each contributor can generate only their own scene with their own private provider account.
      if (scene.created_by !== user.id) { await client.query("ROLLBACK"); return json({ error: "Only the shot contributor can use their Higgsfield account for this scene" }, 403); }
      if (!scene.encrypted_credentials) { await client.query("ROLLBACK"); return json({ error: "Save your own Higgsfield API key in Connections first" }, 409); }
      encrypted = scene.encrypted_credentials;
      try { credentials = decryptProviderCredentials(user.id, encrypted); }
      catch { await client.query("ROLLBACK"); return json({ error: "Higgsfield credentials could not be unlocked. Check the server vault configuration." }, 503); }
      let referenceUrl: string | null = null;
      if (input.referenceGenerationId) {
        const earlier = await client.query(`SELECT j.video_url,j.video_expires_at,s.position
          FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id
          WHERE j.id=$1 AND j.film_id=$2 AND j.status='completed' AND s.position<$3
          FOR SHARE OF j`, [input.referenceGenerationId,filmId,scene.position]);
        if (!earlier.rowCount || typeof earlier.rows[0].video_url !== "string") { await client.query("ROLLBACK"); return json({ error: "The earlier completed shot is unavailable as a visual reference" }, 409); }
        const expiresAt = earlier.rows[0].video_expires_at ? new Date(earlier.rows[0].video_expires_at).getTime() : null;
        if (expiresAt !== null && expiresAt <= Date.now()) { await client.query("ROLLBACK"); return json({ error: "The earlier Higgsfield video link expired. Generate the earlier shot again before continuing it." }, 409); }
        referenceUrl = earlier.rows[0].video_url;
        referenceGenerationId = input.referenceGenerationId;
      }
      prompt = `${scene.title}\n${scene.description}`.trim();
      modelPath = referenceUrl ? HIGGSFIELD_SEEDANCE_25_REFERENCE_MODEL : HIGGSFIELD_SEEDANCE_25_MODEL;
      try { generationInput = referenceUrl ? seedance25ReferenceInput(prompt,referenceUrl,4) : seedance25Input(prompt,4); }
      catch (error) { await client.query("ROLLBACK"); return json({ error: error instanceof Error ? error.message : "Invalid shot prompt" }, 400); }

      const existing = await client.query("SELECT * FROM scene_generation_jobs WHERE contributor_id=$1 AND request_key=$2 FOR UPDATE", [user.id,input.requestKey]);
      if (existing.rowCount) {
        const prior = existing.rows[0];
        if (prior.film_id !== filmId || prior.scene_id !== input.sceneId || prior.prompt !== prompt || (prior.reference_generation_job_id ?? null) !== referenceGenerationId) { await client.query("ROLLBACK"); return json({ error: "Request key already belongs to a different shot" }, 409); }
        await client.query("COMMIT");
        const job = await db.query("SELECT j.*,a.id AS media_asset_id,a.size_bytes AS media_size_bytes,s.title AS scene_title,u.display_name AS contributor_name FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id JOIN users u ON u.id=j.contributor_id LEFT JOIN media_assets a ON a.generation_job_id=j.id AND a.kind='generation_clip' WHERE j.id=$1", [prior.id]);
        return json(publicJob(job.rows[0], user.id), prior.provider_request_id ? 200 : 202);
      }
      const active = await client.query(`SELECT id,status FROM scene_generation_jobs WHERE scene_id=$1 AND contributor_id=$2
        AND status IN ('submitting','uncertain','queued','in_progress') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [input.sceneId,user.id]);
      if (active.rowCount) { await client.query("ROLLBACK"); return json({ error: "A shot request is already active or uncertain. Check its status before starting another paid request.", jobId: active.rows[0].id, status: active.rows[0].status }, 409); }
      jobId = randomUUID();
      await client.query(`INSERT INTO scene_generation_jobs(id,film_id,scene_id,contributor_id,request_key,model_path,prompt,duration_seconds,status,reference_generation_job_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,4,'submitting',$8)`, [jobId,filmId,input.sceneId,user.id,input.requestKey,modelPath,prompt,referenceGenerationId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }

    // Never retry this POST after an ambiguous network timeout: Higgsfield does not document request idempotency.
    const provider = new HiggsfieldApiClient(credentials!);
    try {
      const submitted = await provider.submit(modelPath!,generationInput!);
      await db.query(`UPDATE provider_connections SET verified_at=now(),updated_at=now()
        WHERE user_id=$1 AND provider='higgsfield-api' AND encrypted_credentials=$2`, [user.id,encrypted!]);
      const saved = await db.query(`UPDATE scene_generation_jobs SET provider_request_id=$2,status=$3,video_url=$4,
          video_expires_at=$5,last_error_code=NULL,updated_at=now() WHERE id=$1
        RETURNING *`, [jobId!,submitted.result.requestId,submitted.result.status,submitted.result.outputs.find(output => output.kind === "video")?.url ?? null,submitted.result.expiresAt]);
      const row = await db.query("SELECT j.*,a.id AS media_asset_id,a.size_bytes AS media_size_bytes,s.title AS scene_title,u.display_name AS contributor_name FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id JOIN users u ON u.id=j.contributor_id LEFT JOIN media_assets a ON a.generation_job_id=j.id AND a.kind='generation_clip' WHERE j.id=$1", [saved.rows[0].id]);
      return json(publicJob(row.rows[0],user.id), 202);
    } catch (error) {
      const uncertain = error instanceof ProviderUnavailableError || !(error instanceof HiggsfieldHttpError) || error.status >= 500;
      const code = error instanceof HiggsfieldHttpError ? `provider_${error.status}` : uncertain ? "provider_outcome_uncertain" : "provider_request_rejected";
      await db.query("UPDATE scene_generation_jobs SET status=$2,last_error_code=$3,updated_at=now() WHERE id=$1", [jobId!,uncertain ? "uncertain" : "failed",code]);
      if (error instanceof HiggsfieldHttpError && error.status === 401) await db.query("UPDATE provider_connections SET verified_at=NULL,updated_at=now() WHERE user_id=$1 AND provider='higgsfield-api' AND encrypted_credentials=$2", [user.id,encrypted!]);
      if (error instanceof HiggsfieldHttpError) return json({ error: uncertain ? `Higgsfield returned HTTP ${error.status}; check its dashboard before retrying.` : `Higgsfield rejected the request with HTTP ${error.status}.`, status: uncertain ? "uncertain" : "failed", retryAfter: error.retryAfter, correlationId: error.correlationId }, 502);
      if (uncertain) return json({ error: "The request outcome is uncertain. Check your Higgsfield API dashboard before starting another generation to avoid duplicates.", status: "uncertain", jobId: jobId! }, 502);
      return json({ error: "Could not start the Higgsfield request.", status: "failed", jobId: jobId! }, 502);
    }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not create a generation job" }, 503);
  }
}
