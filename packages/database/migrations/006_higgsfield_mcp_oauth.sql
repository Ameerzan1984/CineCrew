CREATE TABLE IF NOT EXISTS higgsfield_mcp_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  callback_uri text NOT NULL,
  encrypted_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS higgsfield_mcp_oauth_states_expiry_idx
  ON higgsfield_mcp_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS higgsfield_mcp_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  callback_uri text NOT NULL,
  encrypted_tokens text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  access_expires_at timestamptz,
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
