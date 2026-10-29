import uuid

from app import storage


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
