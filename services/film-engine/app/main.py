# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from contextlib import asynccontextmanager
from pathlib import Path
import hmac
import os
import sys

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

# Import CineCrew's actual schema from this monorepo, including in the image.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from src.schemas.blueprint import SceneBlueprint
from src.schemas.assets import AssetLibrary

from . import storage
from .models import AdvanceRequest, FilmCreate, FilmUpdate, FilmIdeaRunRequest
from .pipeline import STAGES


@asynccontextmanager
async def lifespan(_app: FastAPI):
    storage.init_db()
    yield


app = FastAPI(title="CineMesh Film Engine", version="0.1.0", lifespan=lifespan,
              description="Offline film production planning and checkpoint service. No actual media is generated.")


@app.middleware("http")
async def require_service_token(request: Request, call_next):
    # The gateway authenticates users and checks ownership before using this
    # service credential. This shared secret is not itself user authorization.
    if request.url.path == "/health":
        return await call_next(request)
    configured = os.environ.get("FILM_ENGINE_SERVICE_TOKEN", "")
    if not configured:
        return JSONResponse({"detail": "Film engine service token is not configured"}, status_code=503)
    supplied = request.headers.get("X-Cinemesh-Service-Token", "")
    if not hmac.compare_digest(supplied.encode(), configured.encode()):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok", "mode": "offline_mock"}


@app.get("/stages")
def stages():
    return [{"index": i, "id": key, "name": name, "agent": agent}
            for i, (key, name, agent) in enumerate(STAGES)]


@app.post("/films", status_code=201)
def create_film(payload: FilmCreate):
    return storage.create_film(payload.model_dump())


@app.get("/films")
def list_films():
    return storage.list_films()


@app.get("/films/{film_id}")
def get_film(film_id: str):
    film = storage.get_film(film_id)
    if film is None:
        raise HTTPException(404, "Film not found")
    return film


@app.patch("/films/{film_id}")
def update_film(film_id: str, payload: FilmUpdate):
    try:
        film = storage.update_film(film_id, payload.model_dump(exclude_unset=True, exclude_none=True))
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    if film is None:
        raise HTTPException(404, "Film not found")
    return film


@app.get("/films/{film_id}/checkpoints")
def get_checkpoints(film_id: str):
    get_film(film_id)
    return storage.checkpoints(film_id)


@app.put("/films/{film_id}/filmdsl")
def import_filmdsl(film_id: str, payload: dict):
    """Validate and store a CineCrew SceneBlueprint; this does not execute it."""
    get_film(film_id)
    try:
        blueprint = SceneBlueprint.model_validate(payload)
    except ValidationError as error:
        raise HTTPException(422, detail=error.errors(include_context=False)) from error
    normalized = blueprint.model_dump(mode="json")
    storage.save_blueprint(film_id, normalized)
    return normalized


@app.get("/films/{film_id}/filmdsl")
def get_filmdsl(film_id: str):
    get_film(film_id)
    blueprint = storage.get_blueprint(film_id)
    if blueprint is None:
        raise HTTPException(404, "No FilmDSL imported for this film")
    return blueprint


@app.post("/films/{film_id}/production-plan")
def build_production_plan(film_id: str, payload: dict):
    """Build CineCrew job specifications offline; no provider jobs are submitted."""
    get_film(film_id)
    try:
        assets = AssetLibrary.model_validate(payload)
    except ValidationError as error:
        raise HTTPException(422, detail=error.errors(include_context=False)) from error
    try:
        return storage.build_production_plan(film_id, assets)
    except LookupError as error:
        raise HTTPException(409, str(error)) from error


@app.get("/films/{film_id}/production-plan")
def get_production_plan(film_id: str):
    get_film(film_id)
    plan = storage.get_production_plan(film_id)
    if plan is None:
        raise HTTPException(404, "No production plan; import a blueprint and build one first")
    return plan


@app.post("/films/{film_id}/advance")
def advance_film(film_id: str, payload: AdvanceRequest = AdvanceRequest()):
    try:
        return storage.advance(film_id, payload.idempotency_key)
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except ValueError as error:
        raise HTTPException(409, str(error)) from error


@app.post("/films/{film_id}/run")
def run_film(film_id: str):
    """Resume remaining offline planning stages; does not generate media or publish."""
    film = get_film(film_id)
    while film["current_stage"] < film["stage_count"]:
        try:
            storage.advance(film_id)
        except ValueError:
            # Another request may have finished the run concurrently.
            break
        film = get_film(film_id)
    return {"film": get_film(film_id), "checkpoints": storage.checkpoints(film_id)}


@app.post("/films/{film_id}/cinecrew/story-editor")
def run_cinecrew_story_editor(
    film_id: str,
    payload: FilmIdeaRunRequest,
    access_token: str = Header(default="", alias="X-ChatGPT-Plan-Access-Token"),
    model: str = Header(default="", alias="X-ChatGPT-Plan-Model"),
):
    """Run the user's idea through screenplay writing and the configured CineCrew pipeline."""
    if len(access_token) < 32 or len(access_token) > 8192:
        raise HTTPException(401, "A connected ChatGPT plan is required")
    if not model or len(model) > 160:
        raise HTTPException(400, "Select a model from the connected ChatGPT account")
    film = get_film(film_id)
    if film is None:
        raise HTTPException(404, "Film not found")
    film_settings = {
        "title": payload.title or film["title"],
        "genre": payload.genre or film.get("genre", "Drama"),
        "duration_minutes": payload.duration_minutes,
        "language": payload.language,
        "visual_style": payload.visual_style or film.get("visual_style", "Cinematic"),
    }
    try:
        result = storage.run_cinecrew_agents(film_id, payload.run_id.lower(), payload.film_idea, film_settings, access_token, model)
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    except Exception as error:
        # Provider exception details can contain request data; keep them in local agent traces only.
        raise HTTPException(502, "CineCrew agent failed. Check the ChatGPT connection and retry the run.") from error
    if result["status"] == "running":
        raise HTTPException(409, detail={"message": "This run is already in progress", "run_id": payload.run_id})
    return result


@app.get("/films/{film_id}/cinecrew/runs/{run_id}")
def get_cinecrew_run(film_id: str, run_id: str):
    get_film(film_id)
    result = storage.get_agent_run(film_id, run_id.lower())
    if result is None:
        raise HTTPException(404, "Agent run not found")
    return result
