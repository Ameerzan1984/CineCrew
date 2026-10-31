import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { allowedOrigin } from "../../../../../lib/origin";
import type { PoolClient } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string }> };
const validText = (value: unknown, max: number, required = false): value is string =>
  typeof value === "string" && value.length <= max && (!required || !!value.trim());

async function contents(client: PoolClient, filmId: string, userId: string, isOwner: boolean) {
  await client.query(`UPDATE scene_generation_jobs SET status='uncertain',last_error_code='submission_response_missing',updated_at=now()
    WHERE film_id=$1 AND status='submitting' AND provider_request_id IS NULL AND created_at < now()-interval '3 minutes'`, [filmId]);
  const scenes = await client.query(
    `SELECT s.id,s.position,s.title,s.description,s.agent_job_id,s.agent_prompt,s.agent_planned_duration_seconds,s.agent_generation_duration_seconds,
       s.created_by,u.display_name AS creator_name,(s.created_by=$2) AS mine,
       (s.agent_run_id IS NOT NULL AND s.created_by IS NULL) AS claimable
     FROM scenes s LEFT JOIN users u ON u.id=s.created_by WHERE s.film_id=$1 ORDER BY s.position`, [filmId,userId]);
  const characters = await client.query("SELECT id,name,description,asset_id FROM characters WHERE film_id=$1 ORDER BY name,id", [filmId]);
  const generations = await client.query(
    `SELECT j.id,j.film_id,j.scene_id,j.contributor_id,j.model_path,j.prompt,j.duration_seconds,j.status,
      j.provider_request_id,j.video_url,j.video_expires_at,j.reference_generation_job_id,j.last_error_code,j.created_at,j.updated_at,
      a.id AS media_asset_id,a.size_bytes AS media_size_bytes,
      s.title AS scene_title,u.display_name AS contributor_name,(j.contributor_id=$2) AS mine
     FROM scene_generation_jobs j JOIN scenes s ON s.id=j.scene_id JOIN users u ON u.id=j.contributor_id
     LEFT JOIN media_assets a ON a.generation_job_id=j.id AND a.kind='generation_clip'
     WHERE j.film_id=$1 ORDER BY s.position,j.created_at DESC LIMIT 200`, [filmId,userId]);
  const renders = await client.query(`SELECT id,size_bytes,created_at,created_by
    FROM media_assets WHERE film_id=$1 AND kind='film_render' ORDER BY created_at DESC LIMIT 20`, [filmId]);
  const collaborators = await client.query(
    `SELECT c.user_id,c.role,c.created_at,u.display_name FROM film_contributors c
     JOIN users u ON u.id=c.user_id WHERE c.film_id=$1 ORDER BY u.display_name`, [filmId]);
  const invitations = isOwner ? await client.query(
    `SELECT i.user_id,i.role,i.created_at,u.display_name FROM film_invitations i
     JOIN users u ON u.id=i.user_id WHERE i.film_id=$1 AND i.status='pending' ORDER BY i.created_at`, [filmId]) : { rows: [] };
  return { scenes: scenes.rows, characters: characters.rows, generations: generations.rows, renders: renders.rows, collaborators: collaborators.rows, invitations: invitations.rows };
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: "Film not found" }, 404);
    const client = await database().connect();
    try {
      const access = await client.query(
        `SELECT CASE WHEN f.owner_id=$2 THEN 'owner' ELSE c.role END AS role
         FROM films f LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
         WHERE f.id=$1 AND (f.owner_id=$2 OR c.user_id=$2)`, [id, user.id]);
      if (!access.rowCount) return json({ error: "Film not found" }, 404);
      return json({ ...(await contents(client, id, user.id, access.rows[0].role === "owner")), role: access.rows[0].role });
    } finally { client.release(); }
  } catch { return json({ error: "Production data unavailable" }, 503); }
}

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId } = await context.params;
    if (!uuid.test(filmId)) return json({ error: "Film not found" }, 404);
    const raw = await request.text();
    if (raw.length > 16384) return json({ error: "Request too large" }, 413);
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.action !== "string") return json({ error: "Invalid request" }, 400);
    const action = data.action as string;
    const actions = ["create_scene", "update_scene", "delete_scene", "claim_scene", "create_character", "update_character", "delete_character"];
    if (!actions.includes(action)) return json({ error: "Unknown action" }, 400);
    if (!action.startsWith("create_") && (typeof data.id !== "string" || !uuid.test(data.id))) return json({ error: "Invalid item ID" }, 400);
    if (action.endsWith("scene") && !action.startsWith("delete_") && action !== "claim_scene" && (!Number.isInteger(data.position) || data.position < 0 || data.position > 100000 || !validText(data.title, 160, true) || !validText(data.description, 4000))) return json({ error: "Invalid scene fields" }, 400);
    if (action.endsWith("character") && !action.startsWith("delete_") && (!validText(data.name, 160, true) || !validText(data.description, 4000) || !(data.asset_id === null || data.asset_id === undefined || validText(data.asset_id, 160, true)))) return json({ error: "Invalid character fields" }, 400);
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      // The lock serializes edits and ensures every operation is scoped to the authenticated owner.
      const film = await client.query(
        `SELECT f.owner_id,CASE WHEN f.owner_id=$2 THEN 'owner' ELSE c.role END AS role
         FROM films f LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
         WHERE f.id=$1 AND (f.owner_id=$2 OR c.user_id=$2) FOR UPDATE OF f`, [filmId, user.id]);
      if (!film.rowCount) { await client.query("ROLLBACK"); return json({ error: "Film not found" }, 404); }
      const isOwner = film.rows[0].owner_id === user.id;
      const isEditor = isOwner || film.rows[0].role === "editor";
      if (!isEditor) { await client.query("ROLLBACK"); return json({ error: "Editor access required" }, 403); }
      if (!isOwner && action.endsWith("character")) { await client.query("ROLLBACK"); return json({ error: "Only the film owner can edit characters" }, 403); }
      let changed;
      if (action === "claim_scene") changed = await client.query("UPDATE scenes SET created_by=$1 WHERE id=$2 AND film_id=$3 AND agent_run_id IS NOT NULL AND created_by IS NULL", [user.id,data.id,filmId]);
      else if (action === "create_scene") changed = await client.query("INSERT INTO scenes(id,film_id,position,title,description,created_by) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), filmId, data.position, data.title.trim(), data.description, user.id]);
      else if (action === "update_scene") changed = isOwner
        ? await client.query("UPDATE scenes SET position=$1,title=$2,description=$3 WHERE id=$4 AND film_id=$5", [data.position, data.title.trim(), data.description, data.id, filmId])
        : await client.query("UPDATE scenes SET position=$1,title=$2,description=$3 WHERE id=$4 AND film_id=$5 AND created_by=$6", [data.position, data.title.trim(), data.description, data.id, filmId, user.id]);
      else if (action === "delete_scene") changed = isOwner
        ? await client.query("DELETE FROM scenes WHERE id=$1 AND film_id=$2", [data.id, filmId])
        : await client.query("DELETE FROM scenes WHERE id=$1 AND film_id=$2 AND created_by=$3", [data.id, filmId, user.id]);
      else if (action === "create_character") changed = await client.query("INSERT INTO characters(id,film_id,name,description,asset_id) VALUES($1,$2,$3,$4,$5)", [randomUUID(), filmId, data.name.trim(), data.description, data.asset_id?.trim() ?? null]);
      else if (action === "update_character") changed = await client.query("UPDATE characters SET name=$1,description=$2,asset_id=$3 WHERE id=$4 AND film_id=$5", [data.name.trim(), data.description, data.asset_id?.trim() ?? null, data.id, filmId]);
      else changed = await client.query("DELETE FROM characters WHERE id=$1 AND film_id=$2", [data.id, filmId]);
      if (!changed.rowCount) { await client.query("ROLLBACK"); return json({ error: "Item not found" }, 404); }
      await client.query("UPDATE films SET updated_at=now() WHERE id=$1", [filmId]);
      const result = await contents(client, filmId, user.id, isOwner);
      await client.query("COMMIT");
      return json({ ...result, role: film.rows[0].role }, action.startsWith("create_") ? 201 : 200);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    if ((error as { code?: string })?.code === "23505") return json({ error: "Scene position or character asset ID already exists" }, 409);
    return json({ error: "Production data unavailable" }, 503);
  }
}
