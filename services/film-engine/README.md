# CineMesh Film Engine

This service provides a durable, resumable planning pipeline, imports documents validated by CineCrew's `SceneBlueprint` FilmDSL schema, and invokes CineCrew's `ProductionOperatorAgent.build_from_blueprint` to produce job specifications without media execution. The CineMesh idea-to-FilmDSL endpoint now runs a screenplay-writing stage followed by the configured CineCrew stages using a request-scoped ChatGPT plan session. Every completed stage stores its named agent, status and a restorable checkpoint. This code path has not yet been verified with a real ChatGPT OAuth account. It does not submit Higgsfield jobs or invoke FFmpeg; a 120-minute duration is project metadata, not proof that a feature film can be produced.

## Run

```sh
cd services/film-engine
python -m venv .venv
# Activate the environment, then:
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Set `FILM_ENGINE_SERVICE_TOKEN` to a strong secret in the process environment and send it in the `X-Cinemesh-Service-Token` header for all routes except `/health`. Without the secret, protected routes fail closed. The generated OpenAPI reference is protected as well. The SQLite database defaults to `./data/film-engine.db`; set `CINEMESH_ENGINE_DB` to an absolute writable path to change it. SQLite is intended for local development, not a distributed deployment. Persist the data directory when running in a container.

```sh
python -m pytest -q
```

The repository root is added to pytest's import path so the tests can load CineCrew's `src` package while the working directory remains this service.

## API

- `POST /films` creates a project from title, premise, genre, duration, language, visual style and production mode.
- `GET /films`, `GET /films/{id}`, and `PATCH /films/{id}` list, inspect and edit project inputs. Inputs are locked once planning starts to keep checkpoints consistent.
- `GET /stages` lists the 16 ordered stages and responsible agent roles.
- `POST /films/{id}/advance` executes one offline planning step. Provide `{"idempotency_key":"unique-request-id"}` to safely retry a request without advancing twice.
- `POST /films/{id}/run` resumes all remaining planning steps. `GET /films/{id}/checkpoints` reads persisted checkpoints in order.
- `PUT /films/{id}/filmdsl` validates and imports a CineCrew `SceneBlueprint` JSON document; `GET` retrieves the normalized document. This validates the schema, not cross-asset continuity, and does not execute the blueprint.
- `POST /films/{id}/production-plan` accepts an upstream `AssetLibrary` and builds and persists a CineCrew `VideoJobBatch` and its resulting blueprint. `GET` retrieves the plan. Importing a replacement blueprint invalidates the old plan. No job is submitted and no media is generated.
- `POST /films/{id}/cinecrew/story-editor` accepts a film idea and settings from the trusted web gateway, writes a screenplay, then runs the configured CineCrew planning stages with an authorized model connection. `run_id` resumes from per-stage checkpoints; `GET /films/{id}/cinecrew/runs/{run_id}` reads stage states, screenplay, Asset Library, FilmDSL and VideoJobBatch. The web app can import the resulting narrative shots for contributors to claim.

Each offline advancement is committed atomically with its checkpoint. Concurrent advances are serialized; each checkpoint and idempotency key is unique per film. Agent-run checkpoints are stored in the engine SQLite database. Stage output and its completed status are saved atomically. When a running agent has no heartbeat for 15 minutes, retry reconciles saved checkpoints: a checkpointed stage is marked complete and skipped, while an uncheckpointed stage is marked `worker_interrupted` and retried. This was tested by reopening the same SQLite file after simulating interruption; it does not prove a real process kill, backup/restore or multi-replica recovery. The web app indexes each run ID, creator, model and status in PostgreSQL so collaborators can discover run history from another browser; only the original run creator can resume it with their own authorized ChatGPT account. The registry cannot restore output if the engine SQLite data is missing. Keep the engine database on durable storage and keep the service private. `planning_complete` only means offline planning steps have been recorded. It does not mean a real provider render or published film exists. The idea-to-FilmDSL path has unit coverage only until it is run with live OAuth credentials.

The service token authenticates a trusted gateway, not individual users. Do not expose it publicly; the gateway must authenticate each user and enforce film ownership before making every call. Production operation requires a shared database, a durable task queue, real provider adapters, permissions, observability and explicit publication controls.

Build the container from the repository root so it can include CineCrew's schemas: `docker build -f services/film-engine/Dockerfile .`.
