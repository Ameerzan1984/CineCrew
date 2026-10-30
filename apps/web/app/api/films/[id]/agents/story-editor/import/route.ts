import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../../../lib/auth";
import { database } from "../../../../../../../lib/db";
import { allowedOrigin } from "../../../../../../../lib/origin";
import { agentShotsFromRun } from "../../../../../../../lib/agent-shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id: filmId } = await context.params;
    if (!uuid.test(filmId)) return json({ error: "Film not found" }, 404);
    const raw = await request.text();
    if (raw.length > 1024) return json({ error: "Request too large" }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.run_id !== "string" || !uuid.test(input.run_id)) return json({ error: "A valid agent run ID is required" }, 400);
    const db = database();
    const film = await db.query("SELECT engine_film_id FROM films WHERE id=$1 AND owner_id=$2", [filmId,user.id]);
    const engineFilmId = film.rows[0]?.engine_film_id;
    if (!engineFilmId) return json({ error: "Only the film owner can import shots from a linked engine" }, 403);
    const base = process.env.FILM_ENGINE_URL;
    const token = process.env.FILM_ENGINE_SERVICE_TOKEN;
    if (!base || !token) return json({ error: "Film engine is not configured" }, 503);
    const response = await fetch(`${base.replace(/\/$/, "")}/films/${encodeURIComponent(engineFilmId)}/cinecrew/runs/${encodeURIComponent(input.run_id)}`, {
      headers: { "X-Cinemesh-Service-Token": token }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return json({ error: "The agent run could not be retrieved" }, 502);
    let shots;
    try { shots = agentShotsFromRun(await response.json()); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid agent output" }, 409); }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT engine_film_id FROM films WHERE id=$1 AND owner_id=$2 FOR UPDATE", [filmId,user.id]);
      if (locked.rows[0]?.engine_film_id !== engineFilmId) { await client.query("ROLLBACK"); return json({ error: "Film access or engine link changed" }, 409); }
      const existing = await client.query("SELECT count(*)::integer AS count FROM scenes WHERE film_id=$1 AND agent_run_id=$2", [filmId,input.run_id]);
      if (existing.rows[0].count > 0) { await client.query("COMMIT"); return json({ imported: 0, alreadyImported: true }); }
      const position = await client.query("SELECT COALESCE(MAX(position),0)::integer AS last FROM scenes WHERE film_id=$1", [filmId]);
      const last = position.rows[0].last as number;
      if (last + shots.length > 100000) { await client.query("ROLLBACK"); return json({ error: "No scene positions remain" }, 409); }
      for (const [index, shot] of shots.entries()) {
        await client.query(`INSERT INTO scenes(id,film_id,position,title,description,created_by,agent_run_id,agent_shot_id)
          VALUES($1,$2,$3,$4,$5,NULL,$6,$7)`, [randomUUID(),filmId,last+index+1,shot.title,shot.description,input.run_id,shot.sourceId]);
      }
      await client.query("UPDATE films SET updated_at=now() WHERE id=$1", [filmId]);
      await client.query("COMMIT");
      return json({ imported: shots.length, alreadyImported: false }, 201);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "Could not import the agent's shots" }, 503);
  }
}
