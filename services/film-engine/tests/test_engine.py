# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CINEMESH_ENGINE_DB", str(tmp_path / "engine.db"))
    monkeypatch.setenv("FILM_ENGINE_SERVICE_TOKEN", "test-internal-token")
    with TestClient(app) as test_client:
        test_client.headers["X-Cinemesh-Service-Token"] = "test-internal-token"
        yield test_client


def test_service_authentication_fails_closed(client, monkeypatch):
    assert client.get("/health", headers={"X-Cinemesh-Service-Token": ""}).status_code == 200
    assert client.get("/films", headers={"X-Cinemesh-Service-Token": "wrong"}).status_code == 401
    monkeypatch.delenv("FILM_ENGINE_SERVICE_TOKEN")
    assert client.get("/films").status_code == 503


def make_film(client):
    response = client.post("/films", json={"title": "The Last Light", "premise": "A projectionist saves a cinema."})
    assert response.status_code == 201
    return response.json()["id"]


def test_resume_and_honest_media_states(client):
    film_id = make_film(client)
    first = client.post(f"/films/{film_id}/advance", json={"idempotency_key": "first"}).json()
    retry = client.post(f"/films/{film_id}/advance", json={"idempotency_key": "first"}).json()
    assert first == retry
    assert client.get(f"/films/{film_id}").json()["current_stage"] == 1
    result = client.post(f"/films/{film_id}/run").json()
    assert result["film"]["status"] == "planning_complete"
    assert len(result["checkpoints"]) == 16
    assert result["checkpoints"][9]["output"]["status"] == "not_submitted"
    assert result["checkpoints"][-1]["output"]["status"] == "not_published"
    assert client.post(f"/films/{film_id}/run").json() == result
    assert client.post(f"/films/{film_id}/advance").status_code == 409


def test_concurrent_retry_produces_one_checkpoint(client):
    film_id = make_film(client)
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: client.post(f"/films/{film_id}/advance", json={"idempotency_key": "same"}).json(), range(4)))
    assert len({item["id"] for item in results}) == 1
    assert len(client.get(f"/films/{film_id}/checkpoints").json()) == 1


def test_validation_and_locked_inputs(client):
    assert client.post("/films", json={"title": "", "premise": "x"}).status_code == 422
    assert client.get("/films/missing").status_code == 404
    film_id = make_film(client)
    assert client.patch(f"/films/{film_id}", json={"title": "New title"}).json()["title"] == "New title"
    client.post(f"/films/{film_id}/advance")
    assert client.patch(f"/films/{film_id}", json={"title": "Changed"}).status_code == 409


def test_filmdsl_import_validates_cinecrew_schema(client):
    film_id = make_film(client)
    assert client.put(f"/films/{film_id}/filmdsl", json={"blueprint_id": "invalid"}).status_code == 422
    blueprint = {"blueprint_id": "bp-1", "metadata": {"project_name": "The Last Light"}, "global_style": "cinematic", "shots": []}
    saved = client.put(f"/films/{film_id}/filmdsl", json=blueprint)
    assert saved.status_code == 200
    assert client.get(f"/films/{film_id}/filmdsl").json() == saved.json()


def test_cinecrew_builds_real_offline_job_plan(client):
    root = Path(__file__).resolve().parents[3]
    example = root / "examples" / "BetterCallSaul2" / "2026-03-05_07-58-36"
    blueprint = json.loads((example / "shots" / "scene_blueprint_final.json").read_text(encoding="utf-8"))
    assets = json.loads((example / "assets" / "asset_library.json").read_text(encoding="utf-8"))
    film_id = make_film(client)
    assert client.put(f"/films/{film_id}/filmdsl", json=blueprint).status_code == 200
    response = client.post(f"/films/{film_id}/production-plan", json=assets)
    assert response.status_code == 200, response.text
    plan = response.json()
    assert plan["mode"] == "cinecrew_offline_job_plan" and plan["submitted"] is False
    assert len(plan["jobs"]["jobs"]) >= 4
    assert client.get(f"/films/{film_id}/production-plan").json() == plan
    assert client.put(f"/films/{film_id}/filmdsl", json=blueprint).status_code == 200
    assert client.get(f"/films/{film_id}/production-plan").status_code == 404
