CREATE TABLE IF NOT EXISTS scene_generation_jobs (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  model_path text NOT NULL,
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 4 AND 30),
  status text NOT NULL CHECK (status IN ('submitting','uncertain','queued','in_progress','completed','failed','nsfw','canceled')),
  provider_request_id uuid UNIQUE,
  video_url text,
  video_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contributor_id, request_key)
);

CREATE INDEX IF NOT EXISTS scene_generation_jobs_film_idx
  ON scene_generation_jobs(film_id, scene_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scene_generation_jobs_contributor_idx
  ON scene_generation_jobs(contributor_id, status, created_at DESC);
