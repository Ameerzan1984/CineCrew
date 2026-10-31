export type AgentShot = {
  sourceId: string;
  jobId: string;
  title: string;
  description: string;
  prompt: string;
  plannedDurationSeconds: number;
  generationDurationSeconds: number;
};

/** Map actual Production Operator VideoJobs back to their FilmDSL narrative shots. */
export function agentShotsFromRun(value: unknown): AgentShot[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid agent run");
  const run = value as Record<string, unknown>;
  if (run.status !== "completed" || !run.output || typeof run.output !== "object" || Array.isArray(run.output)) throw new Error("The agent run has not completed");
  const blueprint = (run.output as Record<string, unknown>).blueprint;
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) throw new Error("The agent did not return a FilmDSL blueprint");
  const shots = (blueprint as Record<string, unknown>).shots;
  if (!Array.isArray(shots) || shots.length < 1 || shots.length > 100) throw new Error("The agent must return between 1 and 100 shots for this short-film workflow");
  const shotById = new Map<string, { index: number; narrative: Record<string, unknown> }>();
  shots.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid shot in agent blueprint");
    const shot = item as Record<string, unknown>;
    const sourceId = typeof shot.shot_id === "string" ? shot.shot_id.trim() : "";
    const layer = shot.narrative_layer;
    if (!sourceId || sourceId.length > 160 || shotById.has(sourceId) || !layer || typeof layer !== "object" || Array.isArray(layer)) throw new Error("Invalid or duplicate agent shot ID");
    shotById.set(sourceId, { index, narrative: layer as Record<string, unknown> });
  });

  const videoJobs = (run.output as Record<string, unknown>).video_jobs;
  if (!videoJobs || typeof videoJobs !== "object" || Array.isArray(videoJobs) || !Array.isArray((videoJobs as Record<string, unknown>).jobs)) {
    throw new Error("The agent run has no Production Operator VideoJobBatch");
  }
  const jobs = (videoJobs as { jobs: unknown[] }).jobs;
  if (jobs.length < 1 || jobs.length > 100) throw new Error("This short-film studio can import between 1 and 100 video jobs at a time");
  const seen = new Set<string>();
  return jobs.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid VideoJob in agent output");
    const job = item as Record<string, unknown>;
    const sourceId = typeof job.shot_id === "string" ? job.shot_id.trim() : "";
    const jobId = typeof job.job_id === "string" ? job.job_id.trim() : "";
    const shotData = shotById.get(sourceId);
    if (!sourceId || !shotData || !jobId || jobId.length > 200 || seen.has(jobId)) throw new Error("VideoJob does not map to one unique FilmDSL shot");
    seen.add(jobId);
    const narrative = shotData.narrative;
    const action = typeof narrative.narrative_action === "string" ? narrative.narrative_action.trim() : "";
    const emotion = typeof narrative.emotional_beat === "string" ? narrative.emotional_beat.trim() : "";
    const dialogue = narrative.dialogue && typeof narrative.dialogue === "object" && !Array.isArray(narrative.dialogue)
      ? narrative.dialogue as Record<string, unknown> : null;
    const text = dialogue?.has_dialogue === true && typeof dialogue.text === "string" ? dialogue.text.trim() : "";
    const description = [action, emotion ? `Emotion: ${emotion}` : "", text ? `Dialogue: ${text}` : ""].filter(Boolean).join("\n");
    const prompt = typeof job.prompt === "string" ? job.prompt.trim() : "";
    const plannedDurationSeconds = typeof job.duration === "number" ? job.duration : Number.NaN;
    if (!action || description.length > 4000 || !prompt || prompt.length > 4000 || !Number.isFinite(plannedDurationSeconds) || plannedDurationSeconds <= 0) {
      throw new Error("A VideoJob has no usable prompt, narrative action or duration");
    }
    const generationDurationSeconds = Math.max(4, Math.round(plannedDurationSeconds));
    if (generationDurationSeconds > 30) throw new Error("A planned VideoJob exceeds the 30-second limit for this Higgsfield generation path");
    const segment = typeof job.segment_id === "string" ? job.segment_id.trim() : "";
    const title = `Shot ${shotData.index + 1}${segment && !segment.endsWith("_single") ? ` - ${segment}` : ""}`.slice(0, 160);
    return { sourceId, jobId, title, description, prompt, plannedDurationSeconds, generationDurationSeconds };
  });
}
