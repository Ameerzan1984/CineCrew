# CineMesh Film Engine

This service provides a durable, resumable **offline planning** pipeline, imports documents validated by CineCrew's `SceneBlueprint` FilmDSL schema, and invokes CineCrew's `ProductionOperatorAgent.build_from_blueprint` to produce job specifications without network access. It does not run the generative agents, an AI model, Higgsfield, FFmpeg or a publishing service. Checkpoints after planning explicitly say when assets, generation, rendering and publication are pending. A 120-minute duration is accepted as project metadata, not a promise that a feature film can be produced by this adapter.

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
pytest -q
```

## API

- `POST /films` creates a project from title, premise, genre, duration, language, visual style and production mode.
- `GET /films`, `GET /films/{id}`, and `PATCH /films/{id}` list, inspect and edit project inputs. Inputs are locked once planning starts to keep checkpoints consistent.
- `GET /stages` lists the 16 ordered stages and responsible agent roles.
- `POST /films/{id}/advance` executes one offline planning step. Provide `{"idempotency_key":"unique-request-id"}` to safely retry a request without advancing twice.
- `POST /films/{id}/run` resumes all remaining planning steps. `GET /films/{id}/checkpoints` reads persisted checkpoints in order.
- `PUT /films/{id}/filmdsl` validates and imports a CineCrew `SceneBlueprint` JSON document; `GET` retrieves the normalized document. This validates the schema, not cross-asset continuity, and does not execute the blueprint.
- `POST /films/{id}/production-plan` accepts an upstream `AssetLibrary` and builds and persists a CineCrew `VideoJobBatch` and its resulting blueprint. `GET` retrieves the plan. Importing a replacement blueprint invalidates the old plan. No job is submitted and no media is generated.

Each advancement is committed atomically with its checkpoint. Concurrent advances are serialized; each checkpoint and idempotency key is unique per film. `planning_complete` only means all offline planning steps have been recorded. It does not mean that a screenplay, final render or published film exists. Later stages carry pending/empty manifests until real provider, editorial and rendering integrations are implemented.

The service token authenticates a trusted gateway, not individual users. Do not expose it publicly; the gateway must authenticate each user and enforce film ownership before making every call. Production operation requires a shared database, a durable task queue, real provider adapters, permissions, observability and explicit publication controls.

Build the container from the repository root so it can include CineCrew's schemas: `docker build -f services/film-engine/Dockerfile .`.
