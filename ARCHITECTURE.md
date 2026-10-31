# CineMesh architecture

CineMesh preserves the Apache-2.0 CineCrew source, attribution, configs and examples. The CineCrew pipeline represents a film as FilmDSL (`SceneBlueprint`) with stable asset IDs. Its full configured agent sequence turns a narrative into story, staging, resolved visual prompts and production jobs. Running this full LLM pipeline requires an LLM backend configured in the environment; offline `ProductionOperatorAgent.build_from_blueprint()` only turns an already prepared FilmDSL into job specifications.

`apps/web` is the Next.js social and production interface. It authenticates users, enforces project access and talks to PostgreSQL through `packages/database`. Its Higgsfield API credentials are per-user encrypted data. The web routes support a documented Seedance 2.5 generation flow for a contributor's own scene, but this does not by itself make the full agent and worker pipeline automatic.

The Next.js server talks to `services/film-engine` (FastAPI) with a service secret. The film engine checkpoints workflow and FilmDSL data in SQLite; it is not the shared PostgreSQL queue. Keep this internal service private and its database on durable storage. `services/generation-worker` has PostgreSQL scheduling primitives, but they are not yet connected to live provider dispatch. `services/render-worker` concatenates compatible local clips using FFmpeg.

## What has been proved live

On 2026-10-31 a temporary local diagnostic:

- Submitted two real 4-second Seedance 2.5 API generations under one user's API credential.
- Used the first clip as the video reference for the second.
- Downloaded both outputs locally and assembled them with the render worker into an 8.192-second MP4.
- Used CineCrew's real `ProductionOperatorAgent` to build two job specs from manually prepared FilmDSL.

The test did not run the website, PostgreSQL or FastAPI gateway, did not generate the script or FilmDSL with an LLM, and did not use two contributors. The test clips are local ignored artifacts, not a published or persisted CineMesh film. MCP OAuth discovery also worked in a temporary test, but the selected account could not generate through MCP because it requires Plus or higher.

This remains an experimental platform, not a production-ready social network. See [project memory](docs/PROJECT_MEMORY.md), [Higgsfield integration facts](HIGGSFIELD_INTEGRATION.md), [development plan](DEVELOPMENT_PLAN.md), and [next steps](docs/NEXT_STEPS.md). Never expose the internal film service publicly; keep API keys and OAuth credentials out of code, logs, browser storage and Git.
