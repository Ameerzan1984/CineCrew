# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
import json
import hashlib
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .pipeline import STAGES, make_output


def now():
    return datetime.now(timezone.utc).isoformat()


def db_path():
    return os.environ.get("CINEMESH_ENGINE_DB", "./data/film-engine.db")


@contextmanager
def connection():
    path = db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
    finally:
        db.close()


def init_db():
    with connection() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS films (
          id TEXT PRIMARY KEY, data TEXT NOT NULL, current_stage INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS checkpoints (
          id TEXT PRIMARY KEY, film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
          stage_index INTEGER NOT NULL, stage TEXT NOT NULL, agent TEXT NOT NULL,
          output TEXT NOT NULL, created_at TEXT NOT NULL, idempotency_key TEXT,
          UNIQUE(film_id, stage_index), UNIQUE(film_id, idempotency_key)
        );
        CREATE TABLE IF NOT EXISTS blueprints (
          film_id TEXT PRIMARY KEY REFERENCES films(id) ON DELETE CASCADE,
          data TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS production_plans (
          film_id TEXT PRIMARY KEY REFERENCES films(id) ON DELETE CASCADE,
          data TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_runs (
          id TEXT PRIMARY KEY, film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
          agent TEXT NOT NULL, input_hash TEXT NOT NULL, script_segment TEXT NOT NULL, status TEXT NOT NULL,
          stage TEXT NOT NULL, output TEXT, error_code TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS agent_runs_film_idx ON agent_runs(film_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS agent_run_checkpoints (
          run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
          stage TEXT NOT NULL, output TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(run_id, stage)
        );
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(agent_runs)")}
        if "script_segment" not in columns:
            db.execute("ALTER TABLE agent_runs ADD COLUMN script_segment TEXT NOT NULL DEFAULT ''")


def decode_film(row):
    data = json.loads(row["data"])
    data.update(id=row["id"], current_stage=row["current_stage"],
                stage_count=len(STAGES), created_at=row["created_at"], updated_at=row["updated_at"])
    data["status"] = "planning_complete" if row["current_stage"] == len(STAGES) else "draft"
    return data


def decode_checkpoint(row):
    return {"id": row["id"], "film_id": row["film_id"], "stage_index": row["stage_index"],
            "stage": row["stage"], "agent": row["agent"], "output": json.loads(row["output"]),
            "created_at": row["created_at"]}


def create_film(data):
    film_id, timestamp = str(uuid.uuid4()), now()
    with connection() as db:
        db.execute("INSERT INTO films VALUES (?, ?, 0, ?, ?)",
                   (film_id, json.dumps(data, ensure_ascii=False), timestamp, timestamp))
        db.commit()
    return get_film(film_id)


def list_films():
    with connection() as db:
        return [decode_film(row) for row in db.execute("SELECT * FROM films ORDER BY created_at DESC")]


def get_film(film_id):
    with connection() as db:
        row = db.execute("SELECT * FROM films WHERE id = ?", (film_id,)).fetchone()
        return decode_film(row) if row else None


def update_film(film_id, changes):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM films WHERE id = ?", (film_id,)).fetchone()
        if row is None:
            return None
        if row["current_stage"]:
            raise ValueError("Film inputs cannot be changed after planning starts; create a new film to revise them.")
        data = json.loads(row["data"])
        data.update(changes)
        db.execute("UPDATE films SET data = ?, updated_at = ? WHERE id = ?",
                   (json.dumps(data, ensure_ascii=False), now(), film_id))
        db.commit()
    return get_film(film_id)


def checkpoints(film_id):
    with connection() as db:
        return [decode_checkpoint(row) for row in db.execute(
            "SELECT * FROM checkpoints WHERE film_id = ? ORDER BY stage_index", (film_id,))]


def save_blueprint(film_id, data):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO blueprints VALUES (?, ?, ?) ON CONFLICT(film_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                   (film_id, json.dumps(data, ensure_ascii=False), now()))
        db.execute("DELETE FROM production_plans WHERE film_id = ?", (film_id,))
        db.commit()


def get_blueprint(film_id):
    with connection() as db:
        row = db.execute("SELECT data FROM blueprints WHERE film_id = ?", (film_id,)).fetchone()
        return json.loads(row["data"]) if row else None


def build_production_plan(film_id, asset_library):
    # The upstream operator only builds job specifications: it does not call a provider.
    from src.agents.production_operator import ProductionOperatorAgent
    from src.schemas.blueprint import SceneBlueprint

    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT data FROM blueprints WHERE film_id = ?", (film_id,)).fetchone()
        if not row:
            raise LookupError("Import a FilmDSL blueprint first")
        blueprint = SceneBlueprint.model_validate_json(row["data"])
        batch = ProductionOperatorAgent().build_from_blueprint(blueprint, asset_library)
        result = {"mode": "cinecrew_offline_job_plan", "submitted": False,
                  "jobs": batch.model_dump(mode="json"),
                  "blueprint": blueprint.model_dump(mode="json")}
        db.execute("INSERT INTO production_plans VALUES (?, ?, ?) ON CONFLICT(film_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                   (film_id, json.dumps(result, ensure_ascii=False), now()))
        db.commit()
    return result


def get_production_plan(film_id):
    with connection() as db:
        row = db.execute("SELECT data FROM production_plans WHERE film_id = ?", (film_id,)).fetchone()
        return json.loads(row["data"]) if row else None


def advance(film_id, idempotency_key=None):
    with connection() as db:
        # Serialize concurrent advances so retries cannot create duplicate stages.
        db.execute("BEGIN IMMEDIATE")
        film_row = db.execute("SELECT * FROM films WHERE id = ?", (film_id,)).fetchone()
        if film_row is None:
            raise LookupError("Film not found")
        if idempotency_key:
            previous = db.execute("SELECT * FROM checkpoints WHERE film_id = ? AND idempotency_key = ?",
                                  (film_id, idempotency_key)).fetchone()
            if previous:
                return decode_checkpoint(previous)
        index = film_row["current_stage"]
        if index >= len(STAGES):
            raise ValueError("All planning stages are complete")
        stage, _, agent = STAGES[index]
        checkpoint_id, timestamp = str(uuid.uuid4()), now()
        output = make_output(stage, decode_film(film_row))
        db.execute("INSERT INTO checkpoints VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   (checkpoint_id, film_id, index, stage, agent,
                    json.dumps(output, ensure_ascii=False), timestamp, idempotency_key))
        db.execute("UPDATE films SET current_stage = ?, updated_at = ? WHERE id = ?",
                   (index + 1, timestamp, film_id))
        db.commit()
        return decode_checkpoint(db.execute("SELECT * FROM checkpoints WHERE id = ?", (checkpoint_id,)).fetchone())


def _agent_run(row):
    return {"id": row["id"], "film_id": row["film_id"], "agent": row["agent"],
            "script_segment": row["script_segment"],
            "status": row["status"], "stage": row["stage"],
            "output": json.loads(row["output"]) if row["output"] else None,
            "error_code": row["error_code"], "created_at": row["created_at"], "updated_at": row["updated_at"]}


def claim_story_editor_run(film_id, run_id, script_segment):
    digest, timestamp = hashlib.sha256(script_segment.encode("utf-8")).hexdigest(), now()
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        if not db.execute("SELECT 1 FROM films WHERE id=?", (film_id,)).fetchone():
            raise LookupError("Film not found")
        row = db.execute("SELECT * FROM agent_runs WHERE id=?", (run_id,)).fetchone()
        if row:
            if row["film_id"] != film_id or row["agent"] != "cinecrew_story_editor" or row["input_hash"] != digest:
                raise ValueError("Run ID is already bound to different film input")
            if row["status"] == "completed":
                return {"state": "completed", "run": _agent_run(row)}
            if row["status"] == "running":
                try:
                    age = datetime.now(timezone.utc) - datetime.fromisoformat(row["updated_at"])
                except ValueError:
                    age = None
                if age is None or age.total_seconds() < 900:
                    return {"state": "running", "run": _agent_run(row)}
            db.execute("UPDATE agent_runs SET status='running',error_code=NULL,updated_at=? WHERE id=?", (timestamp, run_id))
        else:
            db.execute("INSERT INTO agent_runs(id,film_id,agent,input_hash,script_segment,status,stage,output,error_code,created_at,updated_at) VALUES(?,?,?,?,?,'running','assets',NULL,NULL,?,?)",
                       (run_id, film_id, "cinecrew_story_editor", digest, script_segment, timestamp, timestamp))
        db.commit()
    return {"state": "started", "run": get_agent_run(film_id, run_id)}


def get_agent_checkpoint(run_id, stage):
    with connection() as db:
        row = db.execute("SELECT output FROM agent_run_checkpoints WHERE run_id=? AND stage=?", (run_id, stage)).fetchone()
        return json.loads(row["output"]) if row else None


def set_agent_run_stage(run_id, stage):
    with connection() as db:
        db.execute("UPDATE agent_runs SET stage=?,updated_at=? WHERE id=? AND status='running'", (stage, now(), run_id))
        db.commit()


def save_agent_checkpoint(run_id, stage, output):
    with connection() as db:
        db.execute("INSERT INTO agent_run_checkpoints VALUES(?,?,?,?) ON CONFLICT(run_id,stage) DO UPDATE SET output=excluded.output,created_at=excluded.created_at",
                   (run_id, stage, json.dumps(output, ensure_ascii=False), now()))
        db.execute("UPDATE agent_runs SET updated_at=? WHERE id=? AND status='running'", (now(), run_id))
        db.commit()


def complete_agent_run(film_id, run_id, output):
    with connection() as db:
        db.execute("UPDATE agent_runs SET status='completed',stage='complete',output=?,error_code=NULL,updated_at=? WHERE id=? AND film_id=?",
                   (json.dumps(output, ensure_ascii=False), now(), run_id, film_id))
        db.commit()
    return get_agent_run(film_id, run_id)


def fail_agent_run(run_id, stage, error_code):
    with connection() as db:
        db.execute("UPDATE agent_runs SET status='failed',stage=?,error_code=?,updated_at=? WHERE id=?",
                   (stage, error_code, now(), run_id))
        db.commit()


def get_agent_run(film_id, run_id):
    with connection() as db:
        row = db.execute("SELECT * FROM agent_runs WHERE id=? AND film_id=?", (run_id, film_id)).fetchone()
        return _agent_run(row) if row else None


def run_story_editor(film_id, run_id, script_segment, access_token, model):
    claim = claim_story_editor_run(film_id, run_id, script_segment)
    if claim["state"] == "completed":
        return claim["run"]
    if claim["state"] == "running":
        return claim["run"]

    stage = "assets"
    run_root = Path(db_path()).resolve().parent / "runs" / film_id / run_id
    trace_configured = False
    try:
        from src.utils.agent_trace import set_trace_output_dir
        from src.utils.chatgpt_plan import chatgpt_plan_session
        from src.agents.art_department import ArtDepartmentAgent
        from src.agents.story_editor import StoryEditorAgent
        from src.schemas.assets import AssetLibrary
        from src.schemas.blueprint import SceneBlueprint

        set_trace_output_dir(run_root / "logs")
        trace_configured = True
        with chatgpt_plan_session(access_token, model):
            asset_data = get_agent_checkpoint(run_id, "assets")
            if asset_data is None:
                set_agent_run_stage(run_id, "assets")
                library = ArtDepartmentAgent().run(
                    script_segment,
                    enable_hallucination_guard=True,
                    base_path=str(run_root / "assets"),
                    generate_references=False,
                )
                asset_data = library.model_dump(mode="json")
                save_agent_checkpoint(run_id, "assets", asset_data)
            else:
                library = AssetLibrary.model_validate(asset_data)

            stage = "story_editor"
            set_agent_run_stage(run_id, stage)
            blueprint = StoryEditorAgent().run(script_segment, library)
            blueprint_data = blueprint.model_dump(mode="json")
            save_blueprint(film_id, blueprint_data)
            save_agent_checkpoint(run_id, "story_editor", blueprint_data)
            result = {
                "run_id": run_id,
                "agent": "CineCrew ArtDepartment + StoryEditor",
                "provider": "chatgpt_plan",
                "model": model,
                "status": "completed",
                "characters": len(library.characters),
                "locations": len(library.locations),
                "shots": len(blueprint.shots),
                "asset_library": asset_data,
                "blueprint": blueprint_data,
            }
            return complete_agent_run(film_id, run_id, result)
    except Exception as error:
        # Keep user screenplay and OAuth credentials out of persisted error messages.
        code = getattr(error, "code", None) or type(error).__name__
        fail_agent_run(run_id, stage, str(code)[:80])
        raise
    finally:
        if trace_configured:
            set_trace_output_dir(None)
