CREATE TABLE IF NOT EXISTS moderation_reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user','film')),
  target_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('harassment','spam','copyright','inappropriate','other')),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed','actioned')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (target_id <> reporter_id OR target_type <> 'user')
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_reports_one_active_per_target
  ON moderation_reports(reporter_id,target_type,target_id)
  WHERE status IN ('open','reviewed');
CREATE INDEX IF NOT EXISTS moderation_reports_queue_idx
  ON moderation_reports(status,created_at,id);
CREATE INDEX IF NOT EXISTS moderation_reports_target_idx
  ON moderation_reports(target_type,target_id,created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id uuid PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES moderation_reports(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('dismiss','hide_film','restore_film')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_actions_report_idx
  ON moderation_actions(report_id,created_at,id);

ALTER TABLE films ADD COLUMN IF NOT EXISTS moderation_hidden_at timestamptz;
ALTER TABLE films ADD COLUMN IF NOT EXISTS moderation_hidden_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE films ADD COLUMN IF NOT EXISTS moderation_report_id uuid REFERENCES moderation_reports(id) ON DELETE SET NULL;
