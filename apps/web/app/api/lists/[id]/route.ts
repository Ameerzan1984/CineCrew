import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { database } from "../../../../lib/db";
import { allowedOrigin } from "../../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function readInput(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 4096) return { error: json({ error: "Request too large" }, 413) };
  try {
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: json({ error: "Invalid list" }, 400) };
    return { input: input as Record<string, unknown> };
  } catch { return { error: json({ error: "Invalid JSON" }, 400) }; }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return json({ error: "List not found" }, 404);
  try {
    const user = await currentUser().catch(() => null);
    const list = await database().query(
      `SELECT l.id,l.owner_id,l.name,l.description,l.visibility,l.created_at,l.updated_at,u.display_name AS owner_display_name
       FROM film_lists l JOIN users u ON u.id=l.owner_id
       WHERE l.id=$1 AND (l.visibility='public' OR l.owner_id=$2::uuid)`, [id, user?.id ?? null]);
    if (!list.rows[0]) return json({ error: "List not found" }, 404);
    const items = await database().query(
      `SELECT f.id,f.title,f.premise,f.genre,f.duration_minutes,f.language,f.owner_id,u.display_name AS owner_display_name,
              li.position,li.added_at
       FROM film_list_items li JOIN films f ON f.id=li.film_id JOIN users u ON u.id=f.owner_id
       WHERE li.list_id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL
         AND EXISTS (SELECT 1 FROM media_assets m WHERE m.film_id=f.id AND m.kind='film_render')
       ORDER BY li.position,li.added_at,f.id`, [id]);
    return json({ list: list.rows[0], items: items.rows });
  } catch { return json({ error: "Film list is unavailable" }, 503); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  const { id } = await context.params;
  if (!uuid.test(id)) return json({ error: "List not found" }, 404);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const parsed = await readInput(request);
    if (parsed.error) return parsed.error;
    const input = parsed.input!;
    if ((input.name !== undefined && typeof input.name !== "string") ||
        (input.description !== undefined && typeof input.description !== "string")) {
      return json({ error: "List name and description must be text" }, 400);
    }
    const name = input.name === undefined ? null : typeof input.name === "string" ? input.name.trim() : "";
    const description = input.description === undefined ? null : input.description.trim();
    const visibility = input.visibility === undefined ? null : input.visibility;
    if (name === null && description === null && visibility === null) return json({ error: "No list changes supplied" }, 400);
    if ((name !== null && (!name || name.length > 80)) || (description !== null && description.length > 500) ||
        (visibility !== null && visibility !== "public" && visibility !== "private")) {
      return json({ error: "Enter a valid list name, description and visibility" }, 400);
    }
    try {
      const result = await database().query(
        `UPDATE film_lists SET name=COALESCE($3,name),description=COALESCE($4,description),
           visibility=COALESCE($5,visibility),updated_at=now()
         WHERE id=$1 AND owner_id=$2
         RETURNING id,name,description,visibility,created_at,updated_at`,
        [id, user.id, name, description, visibility]);
      if (!result.rows[0]) return json({ error: "List not found" }, 404);
      return json({ list: result.rows[0] });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return json({ error: "You already have a list with this name" }, 409);
      throw error;
    }
  } catch { return json({ error: "Film list could not be updated" }, 503); }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  const { id } = await context.params;
  if (!uuid.test(id)) return json({ error: "List not found" }, 404);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const result = await database().query("DELETE FROM film_lists WHERE id=$1 AND owner_id=$2 RETURNING id", [id, user.id]);
    if (!result.rowCount) return json({ error: "List not found" }, 404);
    return json({ deleted: true });
  } catch { return json({ error: "Film list could not be deleted" }, 503); }
}
