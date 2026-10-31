import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../../lib/auth";
import { database } from "../../../../../../lib/db";
import { allowedOrigin } from "../../../../../../lib/origin";
import { decryptProviderCredentials, createGenerationQuoteToken, generationQuoteHash } from "../../../../../../lib/provider-vault";
import { HiggsfieldApiClient, HiggsfieldHttpError, HIGGSFIELD_SEEDANCE_25_MODEL, HIGGSFIELD_SEEDANCE_25_REFERENCE_MODEL, ProviderUnavailableError, seedance25Input, seedance25ReferenceInput } from "../../../../../../../../packages/providers/src/index";

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
        s.id AS scene_id,s.position,s.created_by,s.title,s.description,s.agent_job_id,s.agent_prompt,s.agent_planned_duration_seconds,s.agent_generation_duration_seconds,pc.encrypted_credentials
      FROM films f JOIN scenes s ON s.film_id=f.id
      LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$3
      LEFT JOIN provider_connections pc ON pc.user_id=$3 AND pc.provider='higgsfield-api'
      WHERE f.id=$1 AND s.id=$2 AND (f.owner_id=$3 OR c.user_id=$3)`, [filmId,input.sceneId,user.id]);
    if (!result.rowCount) return json({ error: "Scene unavailable" }, 404);
    const scene = result.rows[0];
    if (!(scene.role === "owner" || scene.role === "editor")) return json({ error: "Editor access required" }, 403);
    if (scene.created_by !== user.id) return json({ error: "Only the shot contributor can estimate and spend with their own Higgsfield API account" }, 403);
    if (!scene.encrypted_credentials) return json({ error: "Save your own Higgsfield API key in Connections first" }, 409);
    let credentials: ReturnType<typeof decryptProviderCredentials>;
    try { credentials = decryptProviderCredentials(user.id, scene.encrypted_credentials); }
    catch { return json({ error: "Higgsfield credentials could not be unlocked. Check the server vault configuration." }, 503); }

    let referenceUrl: string | null = null;
    let referenceGenerationId: string | null = null;
    if (input.referenceGenerationId) {
      const earlier = await database().query(`SELECT j.video_url,j.video_expires_at,s.position
        FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id
        WHERE j.id=$1 AND j.film_id=$2 AND j.status='completed' AND s.position<$3`, [input.referenceGenerationId,filmId,scene.position]);
      if (!earlier.rowCount || typeof earlier.rows[0].video_url !== "string") return json({ error: "The earlier completed shot is unavailable as a visual reference" }, 409);
      const expiresAt = earlier.rows[0].video_expires_at ? new Date(earlier.rows[0].video_expires_at).getTime() : null;
      if (expiresAt !== null && expiresAt <= Date.now()) return json({ error: "The earlier Higgsfield video link expired. Generate the earlier shot again before continuing it." }, 409);
      referenceUrl = earlier.rows[0].video_url;
      referenceGenerationId = input.referenceGenerationId as string;
    }

    const prompt = (typeof scene.agent_prompt === "string" && scene.agent_prompt.trim()
      ? scene.agent_prompt : `${scene.title}\n${scene.description}`).trim();
    const durationSeconds = Number.isInteger(scene.agent_generation_duration_seconds) ? scene.agent_generation_duration_seconds : 4;
    const modelPath = referenceUrl ? HIGGSFIELD_SEEDANCE_25_REFERENCE_MODEL : HIGGSFIELD_SEEDANCE_25_MODEL;
    const generationInput = referenceUrl ? seedance25ReferenceInput(prompt,referenceUrl,durationSeconds) : seedance25Input(prompt,durationSeconds);
    const provider = new HiggsfieldApiClient(credentials);
    let estimate;
    try { estimate = await provider.estimate(modelPath,generationInput); }
    catch (error) {
      const status = error instanceof HiggsfieldHttpError ? error.status : 503;
      const message = error instanceof HiggsfieldHttpError && error.status === 404
        ? "Higgsfield did not expose a price estimate for this model. Generation is blocked until an exact quote is available."
        : error instanceof ProviderUnavailableError
          ? "Higgsfield price estimate is unavailable. No generation was submitted. Check the provider and try the estimate again."
          : "Could not obtain an exact Higgsfield USD estimate. No generation was submitted.";
      return json({ error: message }, status === 401 ? 401 : status === 404 ? 503 : status >= 400 && status < 500 ? 502 : 503);
    }
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const quoteToken = createGenerationQuoteToken({
      userId: user.id, filmId, sceneId: scene.scene_id, requestKey: input.requestKey as string,
      referenceGenerationId, modelPath, durationSeconds, promptHash: generationQuoteHash(prompt),
      credentialsHash: generationQuoteHash(scene.encrypted_credentials), estimatedUsd: estimate.usd, expiresAt,
    });
    await database().query(`UPDATE provider_connections SET verified_at=now(),updated_at=now()
      WHERE user_id=$1 AND provider='higgsfield-api' AND encrypted_credentials=$2`, [user.id,scene.encrypted_credentials]);
    return json({ quoteToken, estimatedUsd: estimate.usd, currency: "USD", prompt,
      modelPath, durationSeconds, plannedDurationSeconds: scene.agent_planned_duration_seconds ?? durationSeconds,
      resolution: "720p", audio: true, expiresAt: new Date(expiresAt).toISOString() });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not prepare a Higgsfield estimate" }, 503);
  }
}
