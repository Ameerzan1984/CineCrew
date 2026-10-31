import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { database } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    const user = await currentUser();
    const result = await database().query(
      `SELECT f.id,f.owner_id,f.title,f.premise,f.genre,f.duration_minutes,f.language,f.updated_at AS published_at,
              owner.display_name AS owner_display_name,
              render.id AS media_asset_id,render.size_bytes AS media_size_bytes,
              (SELECT count(*)::integer FROM film_likes l WHERE l.film_id=f.id) AS likes_count,
              (SELECT count(*)::integer FROM comments c WHERE c.film_id=f.id) AS comments_count,
              CASE WHEN $1::uuid IS NULL THEN false ELSE EXISTS (
                SELECT 1 FROM film_likes own_like WHERE own_like.film_id=f.id AND own_like.user_id=$1
              ) END AS liked_by_me
       FROM films f
       JOIN users owner ON owner.id=f.owner_id
       JOIN LATERAL (
         SELECT a.id,a.size_bytes FROM media_assets a
         WHERE a.film_id=f.id AND a.kind='film_render'
         ORDER BY a.created_at DESC,a.id DESC LIMIT 1
       ) render ON true
       WHERE f.status='published' AND f.moderation_hidden_at IS NULL
       ORDER BY f.updated_at DESC,f.id DESC
       LIMIT 60`,
      [user?.id ?? null],
    );
    return json({ films: result.rows });
  } catch {
    return json({ error: "Published films are unavailable" }, 503);
  }
}
