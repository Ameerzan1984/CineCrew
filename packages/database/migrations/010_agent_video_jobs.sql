ALTER TABLE scenes ADD COLUMN IF NOT EXISTS agent_job_id text;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS agent_prompt text;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS agent_planned_duration_seconds double precision;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS agent_generation_duration_seconds integer;

DROP INDEX IF EXISTS scenes_agent_shot_unique;

CREATE UNIQUE INDEX IF NOT EXISTS scenes_agent_job_unique
  ON scenes(film_id, agent_run_id, agent_job_id)
  WHERE agent_run_id IS NOT NULL AND agent_job_id IS NOT NULL;
