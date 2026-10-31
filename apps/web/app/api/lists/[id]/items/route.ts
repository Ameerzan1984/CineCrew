import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { allowedOrigin } from "../../../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function readInput(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 1024) return { error: json({ error: "Request too large" }, 413) };
  try {
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: json({ error: "Invalid request" }, 400) };
    return { input: input as Record<string, unknown> };
  } catch { return { error: json({ error: "Invalid JSON" }, 400) }; }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  const { id } = await context.params;
  if (!uuid.test(id)) return json({ error: "List not found" }, 404);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const parsed = await readInput(request);
    if (parsed.error) return parsed.error;
    const filmId = parsed.input!.filmId;
    if (typeof filmId !== "string" || !uuid.test(filmId)) return json({ error: "Choose a valid film" }, 400);
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const list = await client.query("SELECT id FROM film_lists WHERE id=$1 AND owner_id=$2 FOR UPDATE", [id, user.id]);
      if (!list.rowCount) { await client.query("ROLLBACK"); return json({ error: "List not found" }, 404); }
      const film = await client.query(
        `SELECT f.id FROM films f WHERE f.id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL
          AND EXISTS (SELECT 1 FROM media_assets m WHERE m.film_id=f.id AND m.kind='film_render')
         FOR SHARE`, [filmId]);
      if (!film.rowCount) { await client.query("ROLLBACK"); return json({ error: "Published film not found" }, 404); }
      const inserted = await client.query(
        `INSERT INTO film_list_items(list_id,film_id,position) VALUES($1,$2,
           COALESCE((SELECT max(position)+1 FROM film_list_items WHERE list_id=$1),0))
         ON CONFLICT(list_id,film_id) DO NOTHING RETURNING film_id`, [id, filmId]);
      if (inserted.rowCount) await client.query("UPDATE film_lists SET updated_at=now() WHERE id=$1", [id]);
      const count = await client.query(
        `SELECT count(f.id)::integer AS item_count FROM film_list_items li JOIN films f ON f.id=li.film_id
         WHERE li.list_id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.film_id=f.id AND m.kind='film_render')`, [id]);
      await client.query("COMMIT");
      return json({ added: Boolean(inserted.rowCount), item_count: count.rows[0].item_count });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch { return json({ error: "Film could not be added to this list" }, 503); }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  const { id } = await context.params;
  if (!uuid.test(id)) return json({ error: "List not found" }, 404);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const parsed = await readInput(request);
    if (parsed.error) return parsed.error;
    const filmId = parsed.input!.filmId;
    if (typeof filmId !== "string" || !uuid.test(filmId)) return json({ error: "Choose a valid film" }, 400);
    const result = await database().query(
      `DELETE FROM film_list_items li USING film_lists l
       WHERE li.list_id=l.id AND l.id=$1 AND l.owner_id=$2 AND li.film_id=$3 RETURNING li.film_id`, [id, user.id, filmId]);
    if (!result.rowCount) return json({ error: "List item not found" }, 404);
    await database().query("UPDATE film_lists SET updated_at=now() WHERE id=$1 AND owner_id=$2", [id, user.id]);
    const count = await database().query(
      `SELECT count(f.id)::integer AS item_count FROM film_list_items li JOIN films f ON f.id=li.film_id
       WHERE li.list_id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL
         AND EXISTS (SELECT 1 FROM media_assets m WHERE m.film_id=f.id AND m.kind='film_render')`, [id]);
    return json({ removed: true, item_count: count.rows[0].item_count });
  } catch { return json({ error: "Film could not be removed from this list" }, 503); }
}
