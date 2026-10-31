import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../../lib/auth";
import { database } from "../../../../../../lib/db";
import { allowedOrigin } from "../../../../../../lib/origin";
import { chatGPTAccessToken } from "../../../../../../lib/chatgpt-plan-credentials";
import { listChatGPTModels } from "../../../../../../lib/chatgpt-plan-oauth";
import { buildCollaborativeScript } from "../../../../../../lib/collaborative-script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };

async function engine(path: string, init: RequestInit = {}) {
  if (!process.env.FILM_ENGINE_URL || !process.env.FILM_ENGINE_SERVICE_TOKEN) throw new Error("Film engine is not configured");
  return fetch(`${process.env.FILM_ENGINE_URL.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Cinemesh-Service-Token": process.env.FILM_ENGINE_SERVICE_TOKEN, ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: "Film not found" }, 404);
    const film = await database().query(
      `SELECT f.engine_film_id FROM films f
       LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
       WHERE f.id=$1 AND (f.owner_id=$2 OR c.role='editor')`, [id, user.id]);
    const engineFilmId = film.rows[0]?.engine_film_id;
    if (!engineFilmId) return json({ error: "Link this film to the Film Engine first" }, 409);
    const runId = request.nextUrl.searchParams.get("run_id") ?? "";
    if (!uuid.test(runId)) return json({ error: "A valid run ID is required" }, 400);
    const response = await engine(`/films/${encodeURIComponent(engineFilmId)}/cinecrew/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) return json({ error: "Agent run status is unavailable" }, response.status);
    return json(await response.json());
  } catch { return json({ error: "Agent service is unavailable" }, 503); }
}

export async function POST(request: NextRequest, context: Context) {
  if (!allowedOrigin(request.headers.get("origin"), request.nextUrl.origin)) return json({ error: "Invalid request origin" }, 403);
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: "Film not found" }, 404);
    const raw = await request.text();
    if (raw.length > 24_000) return json({ error: "Film idea and collaborator contributions are too long" }, 413);
    const input = JSON.parse(raw) as { film_idea?: unknown; model?: unknown; run_id?: unknown };
    if (typeof input.film_idea !== "string" || input.film_idea.trim().length < 20 || input.film_idea.length > 20_000) return json({ error: "Enter a film idea (20-20,000 characters)" }, 400);
    if (typeof input.model !== "string" || input.model.length > 160) return json({ error: "Choose a ChatGPT model first" }, 400);
    if (typeof input.run_id !== "string" || !uuid.test(input.run_id)) return json({ error: "A valid run ID is required" }, 400);
    const film = await database().query(
      `SELECT f.engine_film_id,f.title,f.genre,f.duration_minutes,f.language,f.visual_style FROM films f
       LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
       WHERE f.id=$1 AND (f.owner_id=$2 OR c.role='editor')`, [id, user.id]);
    const engineFilmId = film.rows[0]?.engine_film_id;
    if (!engineFilmId) return json({ error: "Link this film to the Film Engine first" }, 409);

    const contributions = await database().query(
      `SELECT s.position,s.title,s.description,u.display_name AS contributor
       FROM scenes s LEFT JOIN users u ON u.id=s.created_by
       WHERE s.film_id=$1 ORDER BY s.position,s.id`, [id]);
    const combinedIdea = buildCollaborativeScript(input.film_idea, contributions.rows);
    if (combinedIdea.length > 20_000) return json({ error: "The film idea and team contributions exceed the agent input limit. Shorten them and retry." }, 413);

    const accessToken = await chatGPTAccessToken(user.id);
    const models = await listChatGPTModels(accessToken);
    if (!models.some(model => model.id === input.model)) return json({ error: "The selected model is not available to this ChatGPT account" }, 400);
    const result = await engine(`/films/${encodeURIComponent(engineFilmId)}/cinecrew/story-editor`, {
      method: "POST",
      headers: { "X-ChatGPT-Plan-Access-Token": accessToken, "X-ChatGPT-Plan-Model": input.model },
      body: JSON.stringify({
        run_id: input.run_id,
        film_idea: combinedIdea,
        title: film.rows[0].title,
        genre: film.rows[0].genre,
        duration_minutes: film.rows[0].duration_minutes,
        language: film.rows[0].language,
        visual_style: film.rows[0].visual_style || "Cinematic",
      }),
    });
    if (!result.ok) {
      const detail = await result.json().catch(() => ({})) as { detail?: unknown };
      if (result.status === 409 && typeof detail.detail === "string") return json({ error: detail.detail }, 409);
      return json({ error: result.status === 409 ? "This agent run is still in progress; resume it from the studio." : "CineCrew could not complete this agent run. Check connection status and retry." }, result.status === 409 ? 409 : 502);
    }
    return json(await result.json());
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    const message = error instanceof Error ? error.message : "Agent request failed";
    return json({ error: message.slice(0, 240) }, 502);
  }
}
