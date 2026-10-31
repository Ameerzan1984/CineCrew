# Database schema

The web application's PostgreSQL migrations live in `packages/database/migrations`. They define users, hashed sessions, login attempts, films, contributors, scenes, characters, comments, likes, follows, encrypted Higgsfield API connections, the lightweight `film_agent_runs` discovery/ownership index, and collaboration notifications. Film APIs check the owner/contributor role required by each operation; a table's presence does not imply that its full user-facing workflow is implemented.

Migration 011 stores CineCrew run ID, film, creator, model, stage and status only; full FilmDSL and stage outputs remain in engine SQLite. Migration 012 stores recipient-scoped film invitation, acceptance and decline events with an optional read timestamp. It is not a general social-activity stream and does not include private messages.

The film engine separately persists project checkpoints, FilmDSL and offline job plans in SQLite. Stage output and its completed marker are committed atomically; stale run recovery reconciles checkpointed stages and retries a stage only when no checkpoint exists. This needs durable backing and is not transactionally coupled to PostgreSQL. A network error during creation can leave an orphan engine project; reconcile before retrying.

The independent scheduler has its own PostgreSQL migration in `services/generation-worker/migrations`. It is not automatically applied by the web migration runner. Missing production entities include asset/object manifests, script and film versions, timelines and render jobs, full agent outputs/checkpoints, messages, general social notifications, moderation, subscriptions, audit and retention controls. Do not store provider secrets in plaintext or in the browser.
