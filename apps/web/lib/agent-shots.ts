export type AgentShot = { sourceId: string; title: string; description: string };

/** Translate the completed CineCrew narrative layer into claimable studio shots. */
export function agentShotsFromRun(value: unknown): AgentShot[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid agent run");
  const run = value as Record<string, unknown>;
  if (run.status !== "completed" || !run.output || typeof run.output !== "object" || Array.isArray(run.output)) throw new Error("The agent run has not completed");
  const blueprint = (run.output as Record<string, unknown>).blueprint;
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) throw new Error("The agent did not return a FilmDSL blueprint");
  const shots = (blueprint as Record<string, unknown>).shots;
  if (!Array.isArray(shots) || shots.length < 1 || shots.length > 100) throw new Error("The agent must return between 1 and 100 shots for this short-film workflow");
  const seen = new Set<string>();
  return shots.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid shot in agent blueprint");
    const shot = item as Record<string, unknown>;
    const sourceId = typeof shot.shot_id === "string" ? shot.shot_id.trim() : "";
    const layer = shot.narrative_layer;
    if (!sourceId || sourceId.length > 160 || seen.has(sourceId) || !layer || typeof layer !== "object" || Array.isArray(layer)) throw new Error("Invalid or duplicate agent shot ID");
    seen.add(sourceId);
    const narrative = layer as Record<string, unknown>;
    const action = typeof narrative.narrative_action === "string" ? narrative.narrative_action.trim() : "";
    const emotion = typeof narrative.emotional_beat === "string" ? narrative.emotional_beat.trim() : "";
    const dialogue = narrative.dialogue && typeof narrative.dialogue === "object" && !Array.isArray(narrative.dialogue)
      ? narrative.dialogue as Record<string, unknown> : null;
    const text = dialogue?.has_dialogue === true && typeof dialogue.text === "string" ? dialogue.text.trim() : "";
    const description = [action, emotion ? `Emotion: ${emotion}` : "", text ? `Dialogue: ${text}` : ""].filter(Boolean).join("\n");
    if (!action || description.length > 4000) throw new Error("An agent shot has no action or exceeds the studio description limit");
    return { sourceId, title: `Shot ${index + 1}`, description };
  });
}
