CREATE TABLE IF NOT EXISTS film_invitations (
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('editor','viewer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id,user_id)
);
CREATE INDEX IF NOT EXISTS film_invitations_user_status_idx ON film_invitations(user_id,status,created_at DESC);
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
