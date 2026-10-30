ALTER TABLE scenes ADD COLUMN IF NOT EXISTS agent_run_id uuid;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS agent_shot_id text;
CREATE UNIQUE INDEX IF NOT EXISTS scenes_agent_shot_unique
  ON scenes(film_id, agent_run_id, agent_shot_id)
  WHERE agent_run_id IS NOT NULL AND agent_shot_id IS NOT NULL;
