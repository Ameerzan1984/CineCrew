CREATE TABLE IF NOT EXISTS film_lists (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS film_lists_owner_name_unique_idx
  ON film_lists(owner_id, lower(name));
CREATE INDEX IF NOT EXISTS film_lists_public_recent_idx
  ON film_lists(updated_at DESC, id DESC)
  WHERE visibility='public';

CREATE TABLE IF NOT EXISTS film_list_items (
  list_id uuid NOT NULL REFERENCES film_lists(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, film_id)
);

CREATE INDEX IF NOT EXISTS film_list_items_order_idx
  ON film_list_items(list_id, position, added_at, film_id);
