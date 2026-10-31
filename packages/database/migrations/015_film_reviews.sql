CREATE TABLE IF NOT EXISTS film_reviews (
  id uuid PRIMARY KEY,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, author_id)
);

CREATE INDEX IF NOT EXISTS film_reviews_film_recent_idx
  ON film_reviews(film_id, created_at DESC, id DESC);
