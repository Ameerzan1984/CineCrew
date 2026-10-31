import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { allowedOrigin } from "../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const result = await database().query(
      `SELECT l.id,l.name,l.description,l.visibility,l.created_at,l.updated_at,
              count(f.id)::integer AS item_count
       FROM film_lists l
       LEFT JOIN film_list_items li ON li.list_id=l.id
       LEFT JOIN films f ON f.id=li.film_id AND f.status='published' AND f.moderation_hidden_at IS NULL
         AND EXISTS (SELECT 1 FROM media_assets m WHERE m.film_id=f.id AND m.kind='film_render')
       WHERE l.owner_id=$1
       GROUP BY l.id
       ORDER BY l.updated_at DESC,l.id DESC`, [user.id]);
    return json({ lists: result.rows });
  } catch { return json({ error: "Film lists are unavailable" }, 503); }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const parsed = await readInput(request);
    if (parsed.error) return parsed.error;
    const input = parsed.input!;
    if (input.description !== undefined && typeof input.description !== "string") return json({ error: "Description must be text" }, 400);
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const description = typeof input.description === "string" ? input.description.trim() : "";
    const visibility = input.visibility === undefined ? "private" : input.visibility;
    if (!name || name.length > 80 || description.length > 500 || (visibility !== "public" && visibility !== "private")) {
      return json({ error: "Enter a list name and valid description and visibility" }, 400);
    }
    try {
      const result = await database().query(
        `INSERT INTO film_lists(id,owner_id,name,description,visibility)
         VALUES($1,$2,$3,$4,$5)
         RETURNING id,name,description,visibility,created_at,updated_at,0::integer AS item_count`,
        [randomUUID(), user.id, name, description, visibility]);
      return json({ list: result.rows[0] }, 201);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return json({ error: "You already have a list with this name" }, 409);
      throw error;
    }
  } catch { return json({ error: "Film list could not be created" }, 503); }
}
