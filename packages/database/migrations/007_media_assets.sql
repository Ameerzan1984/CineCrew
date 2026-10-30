CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  generation_job_id uuid UNIQUE REFERENCES scene_generation_jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('generation_clip', 'film_render')),
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type = 'video/mp4'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'generation_clip' AND scene_id IS NOT NULL AND generation_job_id IS NOT NULL)
    OR (kind = 'film_render' AND scene_id IS NULL AND generation_job_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS media_assets_film_idx
  ON media_assets(film_id, kind, created_at DESC);

ALTER TABLE scene_generation_jobs
  ADD COLUMN IF NOT EXISTS reference_generation_job_id uuid
  REFERENCES scene_generation_jobs(id) ON DELETE SET NULL;
