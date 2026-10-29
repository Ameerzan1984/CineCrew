# CineMesh Film Engine

This service provides a durable, resumable **offline planning** pipeline and imports documents validated by CineCrew's actual `SceneBlueprint` FilmDSL schema. It does not run the CineCrew agents, an AI model, Higgsfield, FFmpeg or a publishing service. Checkpoints after planning explicitly say when assets, generation, rendering and publication are pending. A 120-minute duration is accepted as project metadata, not a promise that a feature film can be produced by this adapter.

## Run

```sh
cd services/film-engine
python -m venv .venv
# Activate the environment, then:
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Visit `http://localhost:8001/docs` for the generated OpenAPI reference. The SQLite database defaults to `./data/film-engine.db`; set `CINEMESH_ENGINE_DB` to an absolute writable path to change it. SQLite is intended for local development, not a distributed deployment. Persist the data directory when running in a container.

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

Each advancement is committed atomically with its checkpoint. Concurrent advances are serialized; each checkpoint and idempotency key is unique per film. `planning_complete` only means all offline planning steps have been recorded. It does not mean that a screenplay, final render or published film exists. Later stages carry pending/empty manifests until real provider, editorial and rendering integrations are implemented.

This internal service has no authentication or authorization. Do not expose it publicly; a trusted application gateway must authenticate requests and enforce film ownership. Production operation requires a shared database, a durable task queue, real provider adapters, permissions, observability and explicit publication controls.

Build the container from the repository root so it can include CineCrew's schemas: `docker build -f services/film-engine/Dockerfile .`.
