import json
import sqlite3
import uuid
from contextlib import contextmanager

from app import storage
from src.schemas.assets import AssetLibrary
from src.schemas.blueprint import SceneBlueprint
from src.schemas.screenplay import ScreenplayDraft


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
