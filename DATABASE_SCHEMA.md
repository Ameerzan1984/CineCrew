# Database schema

The web application's PostgreSQL migrations live in `packages/database/migrations`. They define users, hashed sessions, login attempts, films, contributors, scenes, characters, comments, likes, follows, and encrypted Higgsfield API connections. Film access in the current web API is owner-scoped; the presence of a table alone does not imply that a feature or collaboration permission is implemented.

The film engine separately persists project checkpoints, FilmDSL and offline job plans in SQLite. This needs durable backing and is not transactionally coupled to PostgreSQL. A network error during creation can leave an orphan engine project; reconcile before retrying.

The independent scheduler has its own PostgreSQL migration in `services/generation-worker/migrations`. It is not automatically applied by the web migration runner. Missing production entities include asset and object manifests, script and film versions, timelines and render jobs, agent runs, messages and notifications, moderation, subscriptions, audit and retention controls. Do not store provider secrets in plaintext or in the browser.
