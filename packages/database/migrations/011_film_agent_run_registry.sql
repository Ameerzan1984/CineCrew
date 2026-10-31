CREATE TABLE IF NOT EXISTS film_agent_runs (
  run_id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  stage text NOT NULL DEFAULT 'screenplay_writer',
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS film_agent_runs_film_updated_idx
  ON film_agent_runs(film_id, updated_at DESC);
