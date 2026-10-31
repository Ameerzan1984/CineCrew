ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT ''
  CHECK (char_length(bio) <= 500);
