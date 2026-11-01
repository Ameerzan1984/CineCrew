import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../../../lib/auth";
import { database } from "../../../../../../lib/db";
import { allowedOrigin } from "../../../../../../lib/origin";
import { chatGPTAccessToken } from "../../../../../../lib/chatgpt-plan-credentials";
import { listChatGPTModels } from "../../../../../../lib/chatgpt-plan-oauth";
import { listOpenAIApiModels } from "../../../../../../lib/openai-api";
import { decryptLlmApiKey } from "../../../../../../lib/llm-api-vault";
import { buildCollaborativeScript } from "../../../../../../lib/collaborative-script";
import { sanitizeAgentRunResponse } from "../../../../../../lib/agent-run-response";
import { callFilmEngine as engine } from "../../../../../../lib/film-engine-client";
import { matchesAgentRunBinding } from "../../../../../../lib/agent-run-binding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };

async function registerRun(filmId: string, userId: string, runId: string, model: string, provider: string, llmCostConsent: boolean) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const film = await client.query(
      `SELECT f.owner_id FROM films f LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
       WHERE f.id=$1 AND (f.owner_id=$2 OR c.role='editor') FOR UPDATE OF f`, [filmId, userId]);
    if (!film.rows[0]) { await client.query("ROLLBACK"); return "forbidden" as const; }
    await client.query(
      `INSERT INTO film_agent_runs(run_id,film_id,created_by,model,provider,llm_cost_consent_at,status,stage)
       VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN now() ELSE NULL END,'running','screenplay_writer')
       ON CONFLICT(run_id) DO NOTHING`, [runId, filmId, userId, model, provider, llmCostConsent]);
    const found = await client.query("SELECT film_id,created_by,model,provider,status FROM film_agent_runs WHERE run_id=$1 FOR UPDATE", [runId]);
    const row = found.rows[0];
    if (!matchesAgentRunBinding(row, filmId, userId, model, provider)) {
      await client.query("ROLLBACK");
      return "conflict" as const;
    }
    if (row.status !== "completed") {
      await client.query(`UPDATE film_agent_runs SET status='running',error_code=NULL,updated_at=now(),
        llm_cost_consent_at=CASE WHEN $2 THEN now() ELSE llm_cost_consent_at END WHERE run_id=$1`,
        [runId, llmCostConsent]);
    }
    await client.query("COMMIT");
    return "ok" as const;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* transaction may have failed before opening */ }
    throw error;
  } finally { client.release(); }
}

async function syncRun(filmId: string, run: { id?: string; status?: string; stage?: string; error_code?: string | null }) {
  if (!run.id) return;
  const status = ["running", "completed", "failed"].includes(run.status || "") ? run.status : "running";
  await database().query(
    "UPDATE film_agent_runs SET status=$2,stage=COALESCE($3,stage),error_code=$4,updated_at=now() WHERE film_id=$1 AND run_id=$5",
    [filmId, status, typeof run.stage === "string" ? run.stage.slice(0, 80) : null,
      typeof run.error_code === "string" ? run.error_code.slice(0, 80) : null, run.id]);
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: "Film not found" }, 404);
    const runId = request.nextUrl.searchParams.get("run_id") ?? "";
    if (!uuid.test(runId)) return json({ error: "A valid run ID is required" }, 400);
    const film = await database().query(
      `SELECT f.engine_film_id,r.run_id FROM films f
       LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
       JOIN film_agent_runs r ON r.film_id=f.id AND r.run_id=$3
       WHERE f.id=$1 AND (f.owner_id=$2 OR c.role='editor')`, [id, user.id, runId]);
    const engineFilmId = film.rows[0]?.engine_film_id;
    if (!film.rows[0]) return json({ error: "Agent run not found" }, 404);
    if (!engineFilmId) return json({ error: "Link this film to the Film Engine first" }, 409);
    const response = await engine(`/films/${encodeURIComponent(engineFilmId)}/cinecrew/runs/${encodeURIComponent(runId)}`);
    if (response.status === 404) return json({ error: "This run is listed for the film, but its Film Engine checkpoint is unavailable. Restore the engine data before retrying." }, 410);
    if (!response.ok) return json({ error: "Agent run status is unavailable" }, response.status);
    const run = await response.json();
    await syncRun(id, run);
    return json(sanitizeAgentRunResponse(run));
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
    const input = JSON.parse(raw) as { film_idea?: unknown; model?: unknown; run_id?: unknown; provider?: unknown; llm_cost_consent?: unknown };
    if (typeof input.film_idea !== "string" || input.film_idea.trim().length < 20 || input.film_idea.length > 20_000) return json({ error: "Enter a film idea (20-20,000 characters)" }, 400);
    if (typeof input.model !== "string" || !input.model || input.model.length > 160) return json({ error: "Choose a language model first" }, 400);
    const provider = input.provider ?? "chatgpt_plan";
    if (provider !== "chatgpt_plan" && provider !== "openai_api") return json({ error: "Unsupported language provider" }, 400);
    if (provider === "openai_api" && input.llm_cost_consent !== true) return json({ error: "Approve OpenAI API charges before starting or resuming this run" }, 400);
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

    let credential: string;
    let models: Array<{ id: string }>;
    if (provider === "chatgpt_plan") {
      credential = await chatGPTAccessToken(user.id);
      models = await listChatGPTModels(credential);
    } else {
      const connection = await database().query("SELECT encrypted_credentials FROM llm_api_connections WHERE user_id=$1 AND provider='openai_api'", [user.id]);
      if (!connection.rows[0]) return json({ error: "Connect your OpenAI API account first" }, 409);
      credential = decryptLlmApiKey(user.id, provider, connection.rows[0].encrypted_credentials);
      models = await listOpenAIApiModels(credential);
    }
    if (!models.some(model => model.id === input.model)) return json({ error: "The selected model is not available to this provider account" }, 400);
    const registered = await registerRun(id, user.id, input.run_id, input.model, provider,
      provider === "openai_api" && input.llm_cost_consent === true);
    if (registered === "forbidden") return json({ error: "Film not found" }, 404);
    if (registered === "conflict") return json({ error: "Run ID is already bound to another film, contributor, provider, or model" }, 409);
    const result = await engine(`/films/${encodeURIComponent(engineFilmId)}/cinecrew/story-editor`, {
      method: "POST",
      headers: { "X-LLM-Provider": provider, "X-ChatGPT-Plan-Model": input.model,
        ...(provider === "chatgpt_plan" ? { "X-ChatGPT-Plan-Access-Token": credential } : { "X-LLM-API-Key": credential }) },
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
      if (result.status >= 500) await database().query("UPDATE film_agent_runs SET status='failed',error_code='agent_run_failed',updated_at=now() WHERE film_id=$1 AND run_id=$2 AND status<>'completed'", [id, input.run_id]);
      if (result.status === 409 && typeof detail.detail === "string") return json({ error: detail.detail }, 409);
      return json({ error: result.status === 409 ? "This agent run is still in progress; resume it from the studio." : "CineCrew could not complete this agent run. Check connection status and retry." }, result.status === 409 ? 409 : 502);
    }
    const run = await result.json();
    await syncRun(id, run);
    return json(sanitizeAgentRunResponse(run));
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
    return json({ error: "The selected language provider or agent service is unavailable" }, 502);
  }
}
