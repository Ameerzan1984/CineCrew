# CineMesh architecture

CineMesh preserves the Apache-2.0 CineCrew source, attribution, configs and examples. The CineCrew pipeline represents a film as FilmDSL (`SceneBlueprint`) with stable asset IDs. Its full configured agent sequence turns a narrative into story, staging, resolved visual prompts and production jobs. Running this full LLM pipeline requires an LLM backend configured in the environment; offline `ProductionOperatorAgent.build_from_blueprint()` only turns an already prepared FilmDSL into job specifications.

`apps/web` is the Next.js social and production interface. It authenticates users, enforces project access and talks to PostgreSQL through `packages/database`. Its Higgsfield API credentials are per-user encrypted data. The web routes support a documented Seedance 2.5 generation flow for a contributor's own scene, but this does not by itself make the full agent and worker pipeline automatic.

The Next.js server talks to `services/film-engine` (FastAPI) with a service secret. Full workflow checkpoints and FilmDSL data remain in the film engine's SQLite database; they are not yet stored in the shared PostgreSQL queue. PostgreSQL stores a per-film CineCrew run registry (run ID, creator, model, status and stage), so authorized browsers can find saved runs on another device without browser storage. This index does not contain agent outputs and cannot recover a missing SQLite checkpoint. Cross-device resume therefore depends on keeping the internal engine's SQLite data on durable storage; multi-replica and database-loss recovery remain open. Keep the engine private. `services/generation-worker` has PostgreSQL scheduling primitives, but they are not yet connected to live provider dispatch. `services/render-worker` concatenates compatible local clips using FFmpeg.

The engine writes a completed stage's checkpoint and status in one SQLite transaction. On resume after a stale heartbeat, it reconciles unfinished stage markers against saved checkpoints: a checkpointed stage is restored as complete, while a stage without a checkpoint is marked interrupted and retried. A local test reopens the same SQLite path and simulates this crash window. It does not prove a real process kill, volume backup/restore, shared storage or multi-replica safety.

PostgreSQL also stores a limited collaboration notification inbox: a film invite creates an event for the invitee, and acceptance or decline creates an event for the inviter. The API scopes reads and read-state changes to the recipient. This is not a general activity feed or a messaging system.

## What has been proved live

On 2026-10-31 a temporary local diagnostic:

- Submitted two real 4-second Seedance 2.5 API generations under one user's API credential.
- Used the first clip as the video reference for the second.
- Downloaded both outputs locally and assembled them with the render worker into an 8.192-second MP4.
- Used CineCrew's real `ProductionOperatorAgent` to build two job specs from manually prepared FilmDSL.

The test did not run the website, PostgreSQL or FastAPI gateway, did not generate the script or FilmDSL with an LLM, and did not use two contributors. The test clips are local ignored artifacts, not a published or persisted CineMesh film. MCP OAuth discovery also worked in a temporary test, but the selected account could not generate through MCP because it requires Plus or higher.

This remains an experimental platform, not a production-ready social network. See [project memory](docs/PROJECT_MEMORY.md), [Higgsfield integration facts](HIGGSFIELD_INTEGRATION.md), [development plan](DEVELOPMENT_PLAN.md), and [next steps](docs/NEXT_STEPS.md). Never expose the internal film service publicly; keep API keys and OAuth credentials out of code, logs, browser storage and Git.
