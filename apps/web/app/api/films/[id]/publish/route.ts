import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { mediaFileInfo } from "../../../../../lib/media-store";
import { allowedOrigin } from "../../../../../lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) {
    return json({ error: "Invalid request origin" }, 403);
  }

  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId } = await context.params;
    if (!uuid.test(filmId)) return json({ error: "Film not found" }, 404);

    const raw = await request.text();
    if (raw.length > 1024) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        !["publish", "unpublish"].includes(input.action)) {
      return json({ error: "Choose publish or unpublish" }, 400);
    }

    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const film = await client.query(
        "SELECT owner_id FROM films WHERE id=$1 FOR UPDATE",
        [filmId],
      );
      if (!film.rowCount || film.rows[0].owner_id !== user.id) {
        await client.query("ROLLBACK");
        return json({ error: "Film not found" }, 404);
      }

      const status = input.action === "publish" ? "published" : "draft";
      if (status === "published") {
        const render = await client.query(
          "SELECT storage_key,size_bytes FROM media_assets WHERE film_id=$1 AND kind='film_render' ORDER BY created_at DESC LIMIT 1",
          [filmId],
        );
        if (!render.rowCount) {
          await client.query("ROLLBACK");
          return json({ error: "Assemble and save a film before publishing it" }, 409);
        }
        try {
          const stored = await mediaFileInfo(render.rows[0].storage_key);
          if (stored.size !== Number(render.rows[0].size_bytes)) throw new Error("Render size does not match its stored record");
        } catch {
          await client.query("ROLLBACK");
          return json({ error: "The assembled film file is unavailable; save it again before publishing" }, 409);
        }
      }

      const updated = await client.query(
        "UPDATE films SET status=$2,updated_at=now() WHERE id=$1 RETURNING status",
        [filmId, status],
      );
      await client.query("COMMIT");
      return json({ status: updated.rows[0].status });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not update publication status" }, 503);
  }
}
