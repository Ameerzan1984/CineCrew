CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks(blocked_id, blocker_id);

CREATE TABLE IF NOT EXISTS direct_conversations (
  id uuid PRIMARY KEY,
  participant_low uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_high uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_low, participant_high),
  CHECK (participant_low < participant_high)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS direct_messages_conversation_idx
  ON direct_messages(conversation_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS direct_message_reads (
  conversation_id uuid NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
