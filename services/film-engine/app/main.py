# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from contextlib import asynccontextmanager
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException
from pydantic import ValidationError

# Import CineCrew's actual schema from this monorepo, including in the image.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from src.schemas.blueprint import SceneBlueprint

from . import storage
from .models import AdvanceRequest, FilmCreate, FilmUpdate
from .pipeline import STAGES


@asynccontextmanager
async def lifespan(_app: FastAPI):
    storage.init_db()
    yield


app = FastAPI(title="CineMesh Film Engine", version="0.1.0", lifespan=lifespan,
              description="Offline film production planning and checkpoint service. No actual media is generated.")


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
