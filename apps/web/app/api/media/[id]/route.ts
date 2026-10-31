import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { database } from "../../../../lib/db";
import { mediaFileInfo } from "../../../../lib/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    const { id } = await context.params;
    if (!uuid.test(id)) return response(404);
    const found = await database().query(`SELECT a.storage_key,a.size_bytes,a.mime_type
      FROM media_assets a JOIN films f ON f.id=a.film_id WHERE a.id=$1 AND (
        (f.status='published' AND f.moderation_hidden_at IS NULL AND a.kind='film_render') OR
        ($2::uuid IS NOT NULL AND (f.owner_id=$2 OR EXISTS(
          SELECT 1 FROM film_contributors c WHERE c.film_id=f.id AND c.user_id=$2
        )))
      )`, [id,user?.id ?? null]);
    if (!found.rowCount) return response(404);
    const asset = found.rows[0];
    const stored = await mediaFileInfo(asset.storage_key);
    if (Number(asset.size_bytes) !== stored.size) return response(503);

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": asset.mime_type,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    const range = request.headers.get("range");
    let start = 0;
    let end = stored.size - 1;
    let status = 200;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match || (!match[1] && !match[2])) return response(416);
      if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return response(416);
        start = Math.max(0,stored.size-suffixLength);
      } else start = Number(match[1]);
      if (match[1] && match[2]) end = Number(match[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stored.size || end < start) return response(416);
      end = Math.min(end,stored.size-1);
      status = 206;
      headers.set("Content-Range",`bytes ${start}-${end}/${stored.size}`);
    }
    headers.set("Content-Length",String(end-start+1));
    return new Response(Readable.toWeb(createReadStream(stored.file,{start,end})) as ReadableStream, { status, headers });
  } catch { return response(503); }
}
