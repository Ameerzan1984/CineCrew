import json
import os
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

from fastapi.testclient import TestClient
from fastapi import HTTPException
import pytest
from app import main
from app import storage
from app.main import app
from src.schemas.assets import AssetLibrary, CharacterAsset, LocationAsset, NarrativeContext
from src.schemas.blueprint import (
    NarrativeLayer,
    RenderLayer,
    SceneBlueprint,
    ShotBlueprint,
    StagingLayer,
)
from src.schemas.screenplay import ScreenplayDraft
from src.schemas.video_jobs import VideoJobBatch


def test_agent_provider_error_does_not_leak_credentials_to_client(monkeypatch):
    secret = "provider-key-secret-that-must-not-leak"

    class ProviderError(ValueError):
        code = secret

    film = {
        "id": str(uuid.uuid4()),
        "title": "Safe errors",
        "genre": "Mystery",
        "duration_minutes": 1,
        "language": "en",
        "visual_style": "Cinematic",
    }
    monkeypatch.setattr(main, "get_film", lambda _film_id: film)

    def fail_with_provider_error(*_args, **_kwargs):
        raise ProviderError(f"request failed using {secret}")

    monkeypatch.setattr(storage, "run_cinecrew_agents", fail_with_provider_error)
    payload = main.FilmIdeaRunRequest(
        run_id=str(uuid.uuid4()),
        film_idea="A projectionist uncovers a message hidden in a film reel.",
        title="The Last Reel",
    )

    with pytest.raises(HTTPException) as raised:
        main.run_cinecrew_story_editor(
            film["id"], payload, "x" * 32, "test-model", "chatgpt_plan", ""
        )

    assert raised.value.status_code == 502
    assert secret not in str(raised.value.detail)


def test_openai_story_editor_runs_full_cinecrew_pipeline_and_persists_filmdsl_and_jobs(tmp_path, monkeypatch):
    """Exercise the real engine route and pipeline dispatcher with deterministic, offline agent fakes."""
    monkeypatch.setenv("CINEMESH_ENGINE_DB", str(tmp_path / "film-engine.db"))
    storage.init_db()
    film = storage.create_film({
        "title": "Blue Light",
        "premise": "A lighthouse keeper discovers a signal hidden in the fog.",
        "genre": "Mystery",
        "duration_minutes": 1,
        "language": "en",
        "visual_style": "Cinematic",
    })
    run_id = str(uuid.uuid4())
    provider_key = "synthetic-openai-api-key-for-test"
    agent_calls = []
    pipeline_calls = []

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

    expected = [
        "screenplay_writer", "art_department", "story_editor", "cinematographer",
        "dsl_validator", "vo_director", "technical_director", "dailies_reviewer",
        "production_operator",
    ]
    stages = [dict(item) for item in pipeline.get_enabled_stages()]
    assert [item["id"] for item in stages] == expected
    next(item for item in stages if item["id"] == "art_department")["generate_references"] = True
    next(item for item in stages if item["id"] == "production_operator")["execute"] = True

    library = AssetLibrary(
        project_title="Blue Light",
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
            agent_calls.append("screenplay_writer")
            return ScreenplayDraft(
                title="Blue Light",
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
            agent_calls.append("art_department")
            return library

    class FakeStoryEditor:
        def run(self, _script, _library, *, blueprint):
            agent_calls.append("story_editor")
            blueprint.shots = [ShotBlueprint(
                shot_id="shot_001",
                narrative_layer=NarrativeLayer(
                    narrative_action="The keeper follows a blue light up the stairs.",
                    emotional_beat="Uneasy curiosity",
                ),
            )]
            return blueprint

    class FakeCinematographer:
        def run(self, blueprint, _library):
            agent_calls.append("cinematographer")
            blueprint.shots[0].staging_layer = StagingLayer(
                duration_seconds=5.0,
                environment_id="loc_lighthouse",
            )
            return blueprint

    class FakeDSLValidator:
        def run(self, blueprint, _library, *, auto_correct):
            assert auto_correct is True
            agent_calls.append("dsl_validator")
            return blueprint, {"valid": True, "checked_shots": 1}

    class FakeVODirector:
        def run_on_blueprint(self, blueprint, *_args, **_kwargs):
            agent_calls.append("vo_director")
            return blueprint

    class FakeTechnicalDirector:
        def run(self, blueprint, _library):
            agent_calls.append("technical_director")
            render = RenderLayer()
            render.video.resolved_i2v = "The keeper climbs the storm-dark lighthouse stairs toward a blue light."
            render.image.resolved_t2i = "The keeper pauses on the lighthouse stairs."
            blueprint.shots[0].render_layer = render
            return blueprint

    class FakeDailiesReviewer:
        def run(self, blueprint, _library, **_kwargs):
            agent_calls.append("dailies_reviewer")
            return blueprint, {"total_fixed": 0, "total_rounds": 1, "total_errored": 0}

    actual_run_pipeline = pipeline.run_pipeline
    actual_build_jobs = production_operator.ProductionOperatorAgent.build_from_blueprint

    def recording_run_pipeline(script, *, stages, **kwargs):
        pipeline_calls.append([dict(item) for item in stages])
        return actual_run_pipeline(script, stages=stages, **kwargs)

    def recording_build_jobs(operator, blueprint, assets):
        agent_calls.append("production_operator")
        return actual_build_jobs(operator, blueprint, assets)

    monkeypatch.setattr(pipeline, "get_enabled_stages", lambda: stages)
    monkeypatch.setattr(pipeline, "run_pipeline", recording_run_pipeline)
    monkeypatch.setattr(screenplay_writer, "ScreenplayWriterAgent", FakeScreenplayWriter)
    monkeypatch.setattr(art_department, "ArtDepartmentAgent", FakeArtDepartment)
    monkeypatch.setattr(story_editor, "StoryEditorAgent", FakeStoryEditor)
    monkeypatch.setattr(cinematographer, "CinematographerAgent", FakeCinematographer)
    monkeypatch.setattr(dsl_validator, "DSLValidatorAgent", FakeDSLValidator)
    monkeypatch.setattr(vo_director, "VODirectorAgent", FakeVODirector)
    monkeypatch.setattr(technical_director, "TechnicalDirectorAgent", FakeTechnicalDirector)
    monkeypatch.setattr(dailies_reviewer, "DailiesReviewerAgent", FakeDailiesReviewer)
    monkeypatch.setattr(production_operator.ProductionOperatorAgent, "build_from_blueprint", recording_build_jobs)
    import src.utils.agent_trace as agent_trace
    monkeypatch.setattr(agent_trace, "set_trace_output_dir", lambda *_args, **_kwargs: None)

    result = main.run_cinecrew_story_editor(
        film["id"],
        main.FilmIdeaRunRequest(
            run_id=run_id,
            film_idea="A lighthouse keeper follows a strange signal during a storm.",
            title="Blue Light",
            genre="Mystery",
            duration_minutes=1,
            language="en",
            visual_style="Cinematic",
        ),
        "",
        "synthetic-model",
        "openai_api",
        provider_key,
    )

    assert result["status"] == "completed"
    assert result["output"]["provider"] == "openai_api"
    assert agent_calls == expected
    assert [[item["id"] for item in call] for call in pipeline_calls] == [
        ["screenplay_writer"], expected[1:]
    ]
    offline_stages = pipeline_calls[1]
    assert next(item for item in offline_stages if item["id"] == "art_department")["generate_references"] is False
    assert next(item for item in offline_stages if item["id"] == "production_operator")["execute"] is False

    output = result["output"]
    blueprint = SceneBlueprint.model_validate(output["blueprint"])
    job_batch = VideoJobBatch.model_validate(output["video_jobs"])
    assert blueprint.shots[0].shot_id == "shot_001"
    assert blueprint.shots[0].assembly_layer is not None
    assert job_batch.total_shots == 1
    assert job_batch.jobs[0].shot_id == "shot_001"
    assert job_batch.jobs[0].prompt.startswith("The keeper climbs the storm-dark lighthouse stairs")
    assert output["provider_submission"]["submitted"] is False

    saved = storage.get_agent_run(film["id"], run_id)
    saved_blueprint = SceneBlueprint.model_validate(storage.get_blueprint(film["id"]))
    assert saved["status"] == "completed"
    assert saved["output"]["blueprint"] == output["blueprint"]
    assert saved["output"]["video_jobs"] == output["video_jobs"]
    assert saved_blueprint.model_dump(mode="json") == blueprint.model_dump(mode="json")
    production_checkpoint = storage.get_agent_checkpoint(run_id, "production_operator")
    assert production_checkpoint["scene_blueprint"] == output["blueprint"]
    assert production_checkpoint["video_jobs"] == output["video_jobs"]
    assert [item["stage"] for item in saved["stages"]] == expected
    assert all(item["status"] == "completed" for item in saved["stages"])


def test_failed_agent_run_restores_screenplay_and_saved_checkpoint(tmp_path, monkeypatch):
    monkeypatch.setenv("CINEMESH_ENGINE_DB", str(tmp_path / "film-engine.db"))
    storage.init_db()
    film = storage.create_film({"title": "Resume test", "premise": "A scene used to test restart behavior."})
    run_id = str(uuid.uuid4())
    screenplay = "A lighthouse keeper discovers a message hidden inside the lamp."

    first = storage.claim_story_editor_run(film["id"], run_id, screenplay)
    assert first["state"] == "started"
    storage.save_agent_checkpoint(run_id, "assets", {"characters": ["Keeper"]})
    storage.fail_agent_run(run_id, "story_editor", "TemporaryFailure")

    resumed = storage.claim_story_editor_run(film["id"], run_id, screenplay)
    assert resumed["state"] == "started"
    assert resumed["run"]["script_segment"] == screenplay
    assert storage.get_agent_checkpoint(run_id, "assets") == {"characters": ["Keeper"]}


def test_restart_recovers_checkpointed_stage_without_running_it_again(tmp_path, monkeypatch):
    db_path = tmp_path / "persistent" / "film-engine.db"
    monkeypatch.setenv("CINEMESH_ENGINE_DB", str(db_path))
    storage.init_db()

    film = storage.create_film({"title": "Resume test", "premise": "A keeper follows a blue light."})
    run_id = str(uuid.uuid4())
    film_idea = "A lighthouse keeper discovers a signal that should not exist."
    film_settings = {
        "title": "Blue Light",
        "genre": "Mystery",
        "duration_minutes": 1,
        "language": "en",
        "visual_style": "Cinematic",
    }
    binding = json.dumps(
        {"film_idea": film_idea, "film_settings": film_settings, "model": "test-model"},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    assert storage.claim_story_editor_run(film["id"], run_id, film_idea, binding=binding)["state"] == "started"

    screenplay = ScreenplayDraft(
        title="Blue Light",
        logline="A keeper investigates a mysterious signal.",
        screenplay="A lighthouse keeper discovers a signal hidden in the fog. " * 3,
    )
    screenplay_data = screenplay.model_dump(mode="json")
    library = AssetLibrary(
        project_title="Blue Light",
        global_style="Cinematic",
        narrative_context={"time_period": "present day", "global_mood": "mysterious"},
    )
    blueprint = SceneBlueprint(
        blueprint_id="blue-light-test",
        metadata={"project_name": "Blue Light"},
        global_style="Cinematic",
    )
    art_checkpoint = {
        "screenplay": screenplay_data,
        "script_content": screenplay.screenplay,
        "script_segment": screenplay.screenplay,
        "asset_library": library.model_dump(mode="json"),
        "scene_blueprint": blueprint.model_dump(mode="json"),
    }

    storage.set_agent_stage_run(run_id, "screenplay_writer", "completed")
    storage.save_agent_checkpoint(run_id, "screenplay_writer", {"screenplay": screenplay_data})
    storage.set_agent_run_stage(run_id, "art_department")
    storage.set_agent_stage_run(run_id, "art_department", "running")
    # Simulate a process exit after the completed checkpoint commit but before the
    # separate stage-status commit. The database file remains on its persistent path.
    storage.save_agent_checkpoint(run_id, "art_department", art_checkpoint)
    storage.set_agent_run_stage(run_id, "story_editor")
    storage.set_agent_stage_run(run_id, "story_editor", "running")
    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE agent_runs SET updated_at=? WHERE id=?", ("2000-01-01T00:00:00+00:00", run_id))

    # Reinitialize against the exact same file, as a new service process would.
    storage.init_db()
    assert storage.get_agent_checkpoint(run_id, "art_department") == art_checkpoint

    import src.pipeline as pipeline
    import src.utils.agent_trace as agent_trace
    import src.utils.chatgpt_plan as chatgpt_plan

    monkeypatch.setattr(
        pipeline,
        "get_enabled_stages",
        lambda: [
            {"id": "screenplay_writer", "enabled": True},
            {"id": "art_department", "enabled": True},
            {"id": "story_editor", "enabled": True},
        ],
    )
    executed = []

    def fake_run_pipeline(_script, stages, initial_ctx, stage_callback, **_kwargs):
        ctx = dict(initial_ctx)
        assert [stage_spec["id"] for stage_spec in stages] == ["story_editor"]
        assert isinstance(ctx["asset_library"], AssetLibrary)
        assert isinstance(ctx["scene_blueprint"], SceneBlueprint)
        recovered = {item["stage"]: item for item in storage.get_agent_stage_runs(run_id)}
        assert recovered["art_department"]["status"] == "completed"
        assert recovered["story_editor"]["status"] == "failed"
        assert recovered["story_editor"]["error_code"] == "worker_interrupted"
        for stage_spec in stages:
            stage_id = stage_spec["id"]
            executed.append(stage_id)
            stage_callback(stage_id, "running", ctx)
            stage_callback(stage_id, "completed", ctx)
        return ctx

    @contextmanager
    def fake_chatgpt_session(*_args, **_kwargs):
        yield

    monkeypatch.setattr(pipeline, "run_pipeline", fake_run_pipeline)
    monkeypatch.setattr(agent_trace, "set_trace_output_dir", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(chatgpt_plan, "chatgpt_plan_session", fake_chatgpt_session)

    result = storage.run_cinecrew_agents(
        film["id"], run_id, film_idea, film_settings, "x" * 32, "test-model"
    )

    assert result["status"] == "completed"
    assert executed == ["story_editor"]
    assert storage.get_agent_checkpoint(run_id, "art_department") == art_checkpoint
    stages = {item["stage"]: item for item in storage.get_agent_stage_runs(run_id)}
    assert stages["art_department"]["status"] == "completed"
    assert stages["story_editor"]["status"] == "completed"


def test_postgres_checkpoint_survives_service_restart_and_serializes_advances(monkeypatch, tmp_path):
    database_url = os.environ.get("CINEMESH_TEST_ENGINE_DATABASE_URL")
    if not database_url:
        pytest.skip("CINEMESH_TEST_ENGINE_DATABASE_URL is not configured")

    import psycopg

    schema = f"engine_test_{uuid.uuid4().hex}"
    monkeypatch.setenv("CINEMESH_ENGINE_DATABASE_URL", database_url)
    monkeypatch.setenv("CINEMESH_ENGINE_PG_SCHEMA", schema)
    monkeypatch.setenv("FILM_ENGINE_SERVICE_TOKEN", "postgres-restart-test-token")
    try:
        sqlite_path = tmp_path / "legacy-film-engine.db"
        monkeypatch.delenv("CINEMESH_ENGINE_DATABASE_URL", raising=False)
        monkeypatch.setenv("CINEMESH_ENGINE_DB", str(sqlite_path))
        storage.init_db()
        film = storage.create_film({
            "title": "PostgreSQL recovery",
            "premise": "A projectionist finds a lost reel.",
            "genre": "Mystery",
            "duration_minutes": 5,
            "language": "en",
            "visual_style": "Cinematic",
            "mode": "automatic",
        })
        run_id = str(uuid.uuid4())
        film_idea = "A projectionist finds a lost reel that predicts tomorrow."
        assert storage.claim_story_editor_run(film["id"], run_id, film_idea)["state"] == "started"
        checkpoint = {
            "screenplay": {"title": film["title"], "screenplay": "The projectionist studies the final frame."},
            "asset_library": {"characters": [{"id": "char_keeper", "name": "Projectionist"}]},
            "scene_blueprint": {"blueprint_id": "projectionist-recovery", "shots": [{"shot_id": "shot_001"}]},
        }
        storage.set_agent_stage_run(run_id, "story_editor", "running")
        storage.complete_agent_stage_with_checkpoint(run_id, "story_editor", checkpoint, {"shots": 1})

        monkeypatch.setenv("CINEMESH_ENGINE_DATABASE_URL", database_url)
        storage.init_db()
        imported = storage.migrate_sqlite_to_postgres(sqlite_path)
        assert imported["films"] == 1
        assert imported["agent_run_checkpoints"] == 1
        with pytest.raises(ValueError, match="not empty"):
            storage.migrate_sqlite_to_postgres(sqlite_path)

        # A second FastAPI lifespan recreates the storage connection and schema
        # initialization, matching an engine service restart against PostgreSQL.
        with TestClient(app) as first_process:
            first_process.headers["X-Cinemesh-Service-Token"] = "postgres-restart-test-token"
            assert first_process.get(f"/films/{film['id']}/cinecrew/runs/{run_id}").status_code == 200
        storage.init_db()
        with TestClient(app) as restarted_process:
            restarted_process.headers["X-Cinemesh-Service-Token"] = "postgres-restart-test-token"
            restored = restarted_process.get(f"/films/{film['id']}/cinecrew/runs/{run_id}")
            assert restored.status_code == 200
            assert restored.json()["stages"][0]["status"] == "completed"
            assert storage.get_agent_checkpoint(run_id, "story_editor") == checkpoint

        with ThreadPoolExecutor(max_workers=4) as executor:
            advances = list(executor.map(
                lambda _: storage.advance(film["id"], "same-request"), range(4)
            ))
        assert len({item["id"] for item in advances}) == 1
        assert len(storage.checkpoints(film["id"])) == 1
    finally:
        with psycopg.connect(database_url) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
