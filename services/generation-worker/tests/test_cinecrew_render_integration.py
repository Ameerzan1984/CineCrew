# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""PostgreSQL integration from FilmDSL planning through synthetic clip assembly."""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
FILM_ENGINE_ROOT = REPO_ROOT / "services" / "film-engine"
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(FILM_ENGINE_ROOT))

from test_scheduler import pg_scheduler
from worker import GenerationResult, GenerationWorker


def _load_renderer():
    render_path = REPO_ROOT / "services" / "render-worker" / "render.py"
    spec = importlib.util.spec_from_file_location("cinemesh_cinecrew_render", render_path)
    assert spec and spec.loader
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    return renderer


def _run_fake_cinecrew_engine(film_id, monkeypatch):
    """Run the real engine route/dispatcher with offline substitutes for every LLM agent."""
    from fastapi.testclient import TestClient
    from app import main, storage
    from src.schemas.assets import AssetLibrary, CharacterAsset, LocationAsset, NarrativeContext
    from src.schemas.blueprint import NarrativeLayer, RenderLayer, ShotBlueprint, StagingLayer
    from src.schemas.screenplay import ScreenplayDraft
    import src.pipeline as pipeline
    import src.agents.art_department as art_department
    import src.agents.screenplay_writer as screenplay_writer
    import src.agents.story_editor as story_editor
    import src.agents.cinematographer as cinematographer
    import src.agents.dsl_validator as dsl_validator
    import src.agents.vo_director as vo_director
    import src.agents.technical_director as technical_director
    import src.agents.dailies_reviewer as dailies_reviewer
    import src.agents.production_operator as production_operator
    from src.utils.openai_api_session import current_openai_api_session

    calls = []
    provider_key = "synthetic-openai-api-key-only-used-in-test"
    run_id = str(uuid4())
    configured = [dict(stage) for stage in pipeline.get_enabled_stages()]
    expected_stages = [
        "screenplay_writer", "art_department", "story_editor", "cinematographer",
        "dsl_validator", "vo_director", "technical_director", "dailies_reviewer",
        "production_operator",
    ]
    assert [stage["id"] for stage in configured] == expected_stages
    next(stage for stage in configured if stage["id"] == "art_department")["generate_references"] = True
    next(stage for stage in configured if stage["id"] == "production_operator")["execute"] = True
    monkeypatch.setattr(pipeline, "get_enabled_stages", lambda: configured)

    library = AssetLibrary(
        project_title="Storm Signal",
        global_style="Muted, cinematic mystery",
        narrative_context=NarrativeContext(time_period="Present day", global_mood="Mysterious"),
        characters=[CharacterAsset(id="char_keeper", name="Keeper", description="A weathered lighthouse keeper")],
        locations=[LocationAsset(id="loc_lighthouse", name="Lighthouse", type="INT", visual_style="A storm-lit tower")],
    )

    class FakeScreenplayWriter:
        def run(self, **_kwargs):
            session = current_openai_api_session()
            assert session is not None
            assert session.api_key == provider_key
            assert session.model == "synthetic-model"
            calls.append("screenplay_writer")
            return ScreenplayDraft(
                title="Storm Signal",
                logline="A keeper follows a signal through a storm.",
                screenplay=(
                    "INT. LIGHTHOUSE - NIGHT\n\n"
                    "The keeper follows a blue light through the tower, where the signal grows "
                    "brighter as the storm rattles every window."
                ),
            )

    class FakeArtDepartment:
        def run(self, _script, *, generate_references, **_kwargs):
            assert generate_references is False
            calls.append("art_department")
            return library

    class FakeStoryEditor:
        def run(self, _script, _library, *, blueprint):
            calls.append("story_editor")
            blueprint.shots = [
                ShotBlueprint(
                    shot_id="shot_001",
                    narrative_layer=NarrativeLayer(
                        narrative_action="The keeper climbs the lighthouse stairs.",
                        emotional_beat="Uneasy curiosity",
                    ),
                ),
                ShotBlueprint(
                    shot_id="shot_002",
                    narrative_layer=NarrativeLayer(
                        narrative_action="The keeper reaches the lantern room.",
                        emotional_beat="Quiet alarm",
                    ),
                ),
            ]
            return blueprint

    class FakeCinematographer:
        def run(self, blueprint, _library):
            calls.append("cinematographer")
            for shot in blueprint.shots:
                shot.staging_layer = StagingLayer(
                    duration_seconds=1.0,
                    environment_id="loc_lighthouse",
                )
            return blueprint

    class FakeDSLValidator:
        def run(self, blueprint, _library, *, auto_correct):
            assert auto_correct is True
            calls.append("dsl_validator")
            return blueprint, {"valid": True, "checked_shots": 2}

    class FakeVODirector:
        def run_on_blueprint(self, blueprint, *_args, **_kwargs):
            calls.append("vo_director")
            return blueprint

    class FakeTechnicalDirector:
        def run(self, blueprint, _library):
            calls.append("technical_director")
            for shot in blueprint.shots:
                render = RenderLayer()
                render.video.resolved_i2v = f"Resolved synthetic motion prompt for {shot.shot_id}."
                render.image.resolved_t2i = f"Resolved synthetic keyframe prompt for {shot.shot_id}."
                shot.render_layer = render
            return blueprint

    class FakeDailiesReviewer:
        def run(self, blueprint, _library, **_kwargs):
            calls.append("dailies_reviewer")
            return blueprint, {"total_fixed": 0, "total_rounds": 1, "total_errored": 0}

    actual_build_jobs = production_operator.ProductionOperatorAgent.build_from_blueprint

    def recording_build_jobs(operator, blueprint, assets):
        calls.append("production_operator")
        return actual_build_jobs(operator, blueprint, assets)

    def reject_media_execution(*_args, **_kwargs):
        pytest.fail("planning must not execute image or video providers")

    monkeypatch.setattr(screenplay_writer, "ScreenplayWriterAgent", FakeScreenplayWriter)
    monkeypatch.setattr(art_department, "ArtDepartmentAgent", FakeArtDepartment)
    monkeypatch.setattr(story_editor, "StoryEditorAgent", FakeStoryEditor)
    monkeypatch.setattr(cinematographer, "CinematographerAgent", FakeCinematographer)
    monkeypatch.setattr(dsl_validator, "DSLValidatorAgent", FakeDSLValidator)
    monkeypatch.setattr(vo_director, "VODirectorAgent", FakeVODirector)
    monkeypatch.setattr(technical_director, "TechnicalDirectorAgent", FakeTechnicalDirector)
    monkeypatch.setattr(dailies_reviewer, "DailiesReviewerAgent", FakeDailiesReviewer)
    monkeypatch.setattr(production_operator.ProductionOperatorAgent, "build_from_blueprint", recording_build_jobs)
    monkeypatch.setattr(production_operator.ProductionOperatorAgent, "execute_jobs", reject_media_execution)

    service_token = "synthetic-engine-service-token"
    monkeypatch.setenv("FILM_ENGINE_SERVICE_TOKEN", service_token)
    with TestClient(main.app) as client:
        response = client.post(
            f"/films/{film_id}/cinecrew/story-editor",
            headers={
                "X-Cinemesh-Service-Token": service_token,
                "X-LLM-Provider": "openai_api",
                "X-LLM-API-Key": provider_key,
                "X-ChatGPT-Plan-Model": "synthetic-model",
            },
            json={
                "run_id": run_id,
                "film_idea": "A lighthouse keeper follows a strange signal through a storm.",
                "title": "Storm Signal",
                "genre": "Mystery",
                "duration_minutes": 1,
                "language": "en",
                "visual_style": "Cinematic",
            },
        )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "completed"
    assert result["output"]["provider"] == "openai_api"
    assert calls == expected_stages
    assert result["output"]["provider_submission"]["submitted"] is False
    return storage, result


def test_cinecrew_jobs_run_for_two_contributors_and_render_from_private_refs(pg_scheduler, tmp_path, monkeypatch):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("ffmpeg and ffprobe are required for the synthetic media integration")

    scheduler, owner, project = pg_scheduler
    other_owner = str(uuid4())
    dsn = os.environ["CINEMESH_TEST_POSTGRES_URL"]
    engine_schema = "test_cinecrew_engine_" + uuid4().hex
    monkeypatch.setenv("CINEMESH_ENGINE_DATABASE_URL", dsn)
    monkeypatch.setenv("CINEMESH_ENGINE_PG_SCHEMA", engine_schema)
    monkeypatch.setenv("CINEMESH_ENGINE_DB", str(tmp_path / "engine" / "film-engine.db"))

    import psycopg
    from psycopg import sql
    try:
        from app import storage
        storage.init_db()
        film = storage.create_film({
            "title": "Storm Signal",
            "premise": "A lighthouse keeper follows a strange signal through a storm.",
            "genre": "Mystery",
            "duration_minutes": 1,
            "language": "en",
            "visual_style": "Cinematic",
        })
        engine_storage, run = _run_fake_cinecrew_engine(film["id"], monkeypatch)
        assert engine_storage.get_agent_run(film["id"], run["id"])["status"] == "completed"
        production_checkpoint = engine_storage.get_agent_checkpoint(run["id"], "production_operator")
        assert production_checkpoint["scene_blueprint"] == run["output"]["blueprint"]
        assert production_checkpoint["video_jobs"] == run["output"]["video_jobs"]

        from src.schemas.blueprint import SceneBlueprint
        from src.schemas.video_jobs import VideoJobBatch

        blueprint = SceneBlueprint.model_validate(run["output"]["blueprint"])
        batch = VideoJobBatch.model_validate(run["output"]["video_jobs"])
        expected_shots = [shot.shot_id for shot in blueprint.shots]
        assert expected_shots == ["shot_001", "shot_002"]
        assert [job.shot_id for job in batch.jobs] == expected_shots
        assert [job.prompt for job in batch.jobs] == [
            "Resolved synthetic motion prompt for shot_001.",
            "Resolved synthetic motion prompt for shot_002.",
        ]

        authorized_pairs = set()
        def authorize_membership(actor, target, _action):
            if actor not in (owner, other_owner) or target != project:
                raise PermissionError("denied")

        scheduler.authorize = authorize_membership
        for actor in (owner, other_owner):
            resource = scheduler.register_resource(actor, "synthetic-only", ["video"], "USD")
            scheduler.grant(actor, project, resource, 100)
            authorized_pairs.add((actor, resource))
        owner_by_resource = {resource: actor for actor, resource in authorized_pairs}
        resource_by_owner = {actor: resource for actor, resource in authorized_pairs}

        authorized_as = []

        def authorize(task):
            authorized_as.append((task.resource_owner_id, task.resource_id))
            return task.project_id == project and resource_by_owner.get(task.resource_owner_id) == task.resource_id

        for index, job in enumerate(batch.jobs):
            assert job.job_id
            scheduler.enqueue(
                owner,
                project,
                job.shot_id,
                f"cinecrew:{run['id']}:{job.job_id}",
                "video",
                "USD",
                10,
            )
            # Explicitly preserve the FilmDSL job order for the scheduler claim queue.
            with scheduler.connect() as connection, connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE generation_jobs SET created_at=%s WHERE project_id=%s AND request_key=%s",
                    (datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=index),
                     project, f"cinecrew:{run['id']}:{job.job_id}"),
                )

        class SyntheticProvider:
            def __init__(self):
                self.tasks = []

            def execute(self, task):
                self.tasks.append(task)
                job = next(candidate for candidate in batch.jobs if candidate.shot_id == task.shot_id)
                assert job.duration == 1.0
                assert job.prompt.startswith("Resolved synthetic motion prompt")
                color = "red" if task.shot_id == "shot_001" else "blue"
                path = tmp_path / "provider-results" / f"{task.job_id}.mp4"
                path.parent.mkdir(parents=True, exist_ok=True)
                subprocess.run([
                    "ffmpeg", "-nostdin", "-v", "error", "-n", "-f", "lavfi",
                    "-i", f"color=c={color}:s=160x90:r=24:d=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(path),
                ], check=True, timeout=30, capture_output=True)
                return GenerationResult(actual_micros=10, local_media_path=path, content_type="video/mp4")

        class FakePrivateObjectStorage:
            def __init__(self, root):
                self.root = root
                self.uploads = []

            def put_file(self, object_name, path, content_type="application/octet-stream"):
                assert content_type == "video/mp4"
                destination = self.root / object_name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, destination)
                self.uploads.append((object_name, Path(path), destination))
                return object_name

        provider = SyntheticProvider()
        private_storage = FakePrivateObjectStorage(tmp_path / "private-objects")
        worker = GenerationWorker(
            scheduler,
            provider,
            authorize,
            lease_seconds=30,
            heartbeat_interval=1,
            object_storage=private_storage,
        )
        outcomes = [worker.run_once(project) for _ in batch.jobs]
        assert [outcome.status for outcome in outcomes] == ["completed"] * len(batch.jobs)
        assert [task.shot_id for task in provider.tasks] == expected_shots
        assert all((task.resource_owner_id, task.resource_id) in authorized_pairs for task in provider.tasks)
        assert len({task.resource_owner_id for task in provider.tasks}) == 2
        assert authorized_as == [(task.resource_owner_id, task.resource_id) for task in provider.tasks]
        assert scheduler.progress(owner, project) == {"completed": 2}

        ordered_refs = []
        with scheduler.connect() as connection, connection.cursor() as cursor:
            for job, outcome, task in zip(batch.jobs, outcomes, provider.tasks):
                cursor.execute(
                    """SELECT j.status,j.shot_id,j.result_ref,r.owner_id,r.id AS resource_id
                       FROM generation_jobs j JOIN generation_grants g ON g.id=j.grant_id
                       JOIN generation_resources r ON r.id=g.resource_id WHERE j.id=%s""",
                    (outcome.job_id,),
                )
                row = cursor.fetchone()
                assert row["status"] == "completed"
                assert row["shot_id"] == job.shot_id
                assert row["owner_id"] == task.resource_owner_id
                assert row["resource_id"] == task.resource_id
                assert row["owner_id"] == owner_by_resource[row["resource_id"]]
                expected_ref = f"projects/{project}/jobs/{outcome.job_id}/result"
                assert row["result_ref"] == expected_ref
                ordered_refs.append(row["result_ref"])

        assert [entry[0] for entry in private_storage.uploads] == ordered_refs
        assert all(destination.is_file() for _, _, destination in private_storage.uploads)
        manifest = tmp_path / "private-objects" / "render-manifest.json"
        manifest.write_text(json.dumps({"clips": ordered_refs}), encoding="utf-8")
        renderer = _load_renderer()
        renderer.render(tmp_path / "private-objects", manifest.name, "assembled.mp4")

        assembled = tmp_path / "private-objects" / "assembled.mp4"
        probe = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
            "-of", "json", str(assembled),
        ], check=True, capture_output=True, text=True, timeout=30)
        media_info = json.loads(probe.stdout)
        video_stream = next(stream for stream in media_info["streams"] if stream["codec_type"] == "video")
        duration = float(media_info["format"]["duration"])
        assert video_stream["codec_name"] == "h264"
        assert (video_stream["width"], video_stream["height"]) == (160, 90)
        assert 1.9 <= duration <= 2.2

        def sample_rgb(timestamp):
            frame = subprocess.run([
                "ffmpeg", "-nostdin", "-v", "error", "-i", str(assembled),
                "-ss", timestamp, "-frames:v", "1", "-vf", "scale=1:1",
                "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
            ], check=True, capture_output=True, timeout=30)
            return tuple(frame.stdout[:3])

        first_rgb, second_rgb = sample_rgb("0.25"), sample_rgb("1.25")
        assert first_rgb[0] > first_rgb[2]
        assert second_rgb[2] > second_rgb[0]
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(assembled), "-f", "null", "-"],
                       check=True, timeout=30, capture_output=True)
    finally:
        with psycopg.connect(dsn, autocommit=True) as connection:
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(engine_schema)))
