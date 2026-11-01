CREATE TABLE IF NOT EXISTS llm_api_connections (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'openai_api'),
  encrypted_credentials text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE film_agent_runs ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'chatgpt_plan';
ALTER TABLE film_agent_runs ADD COLUMN IF NOT EXISTS llm_cost_consent_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'film_agent_runs_provider_check'
      AND conrelid = 'film_agent_runs'::regclass
  ) THEN
    ALTER TABLE film_agent_runs ADD CONSTRAINT film_agent_runs_provider_check
      CHECK (provider IN ('chatgpt_plan', 'openai_api'));
  END IF;
END
$$;
