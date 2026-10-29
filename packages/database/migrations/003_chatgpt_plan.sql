CREATE TABLE IF NOT EXISTS application_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS chatgpt_plan_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  subject text NOT NULL,
  email text,
  display_name text,
  encrypted_credentials text NOT NULL,
  scopes text[] NOT NULL,
  last_inference_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, subject)
);

CREATE TABLE IF NOT EXISTS chatgpt_oauth_transactions (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_transaction text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chatgpt_oauth_transactions_expiry_idx ON chatgpt_oauth_transactions(expires_at);
