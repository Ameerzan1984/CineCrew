ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS comments_id_film_unique_idx
  ON comments(id, film_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_parent_same_film_fkey'
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_parent_same_film_fkey
      FOREIGN KEY (parent_comment_id, film_id)
      REFERENCES comments(id, film_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS comments_parent_recent_idx
  ON comments(parent_comment_id, created_at, id)
  WHERE parent_comment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION cinemesh_comment_parent_must_be_root()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_comment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM comments parent
    WHERE parent.id = NEW.parent_comment_id
      AND parent.film_id = NEW.film_id
      AND parent.parent_comment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Replies must target a top-level comment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_parent_must_be_root_trigger ON comments;
CREATE TRIGGER comments_parent_must_be_root_trigger
  BEFORE INSERT OR UPDATE OF parent_comment_id, film_id ON comments
  FOR EACH ROW EXECUTE FUNCTION cinemesh_comment_parent_must_be_root();
