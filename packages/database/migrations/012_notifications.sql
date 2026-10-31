CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('film_invitation','invitation_accepted','invitation_declined')),
  role text NOT NULL CHECK (role IN ('editor','viewer')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON notifications(recipient_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications(recipient_id, created_at DESC)
  WHERE read_at IS NULL;
