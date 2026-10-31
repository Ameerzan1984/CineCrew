import { NextResponse } from "next/server";
import { database } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    const result = await database().query(
      `SELECT l.id,l.name,l.description,l.updated_at,u.id AS owner_id,u.display_name AS owner_display_name,
              count(f.id)::integer AS item_count
       FROM film_lists l JOIN users u ON u.id=l.owner_id
       LEFT JOIN film_list_items li ON li.list_id=l.id
       LEFT JOIN films f ON f.id=li.film_id AND f.status='published' AND f.moderation_hidden_at IS NULL
         AND EXISTS (SELECT 1 FROM media_assets m WHERE m.film_id=f.id AND m.kind='film_render')
       WHERE l.visibility='public'
       GROUP BY l.id,u.id
       ORDER BY l.updated_at DESC,l.id DESC
       LIMIT 50`);
    return json({ lists: result.rows });
  } catch { return json({ error: "Public film lists are unavailable" }, 503); }
}
