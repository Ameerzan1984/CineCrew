ALTER TABLE scene_generation_jobs
  ADD COLUMN IF NOT EXISTS estimated_usd numeric(12,6),
  ADD COLUMN IF NOT EXISTS approved_max_usd numeric(12,6);
