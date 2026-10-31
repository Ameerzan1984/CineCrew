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
        CREATE TABLE IF NOT EXISTS agent_stage_runs (
          run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
          stage TEXT NOT NULL, agent TEXT NOT NULL, status TEXT NOT NULL,
          output TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
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


def _recover_abandoned_agent_stages(db, run_id, timestamp):
    """Reconcile stage markers left running after a stale process exited.

    A durable checkpoint means the stage finished even if the old process stopped
    before updating its status row. Without a checkpoint, the stage is marked
    failed so the normal resume path can retry it.
    """
    running = db.execute(
        "SELECT stage FROM agent_stage_runs WHERE run_id=? AND status='running'", (run_id,)
    ).fetchall()
    for item in running:
        checkpointed = db.execute(
            "SELECT 1 FROM agent_run_checkpoints WHERE run_id=? AND stage=?",
            (run_id, item["stage"]),
        ).fetchone()
        if checkpointed:
            db.execute(
                "UPDATE agent_stage_runs SET status='completed',error_code=NULL,updated_at=? "
                "WHERE run_id=? AND stage=? AND status='running'",
                (timestamp, run_id, item["stage"]),
            )
        else:
            db.execute(
                "UPDATE agent_stage_runs SET status='failed',error_code='worker_interrupted',updated_at=? "
                "WHERE run_id=? AND stage=? AND status='running'",
                (timestamp, run_id, item["stage"]),
            )


def claim_story_editor_run(film_id, run_id, script_segment, binding=None):
    digest, timestamp = hashlib.sha256((binding or script_segment).encode("utf-8")).hexdigest(), now()
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        if not db.execute("SELECT 1 FROM films WHERE id=?", (film_id,)).fetchone():
            raise LookupError("Film not found")
        row = db.execute("SELECT * FROM agent_runs WHERE id=?", (run_id,)).fetchone()
        if row:
            if row["film_id"] != film_id or row["agent"] != "cinecrew_full_pipeline" or row["input_hash"] != digest:
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
                _recover_abandoned_agent_stages(db, run_id, timestamp)
            db.execute("UPDATE agent_runs SET status='running',error_code=NULL,updated_at=? WHERE id=?", (timestamp, run_id))
        else:
            db.execute("INSERT INTO agent_runs(id,film_id,agent,input_hash,script_segment,status,stage,output,error_code,created_at,updated_at) VALUES(?,?,?,?,?,'running','screenplay_writer',NULL,NULL,?,?)",
                       (run_id, film_id, "cinecrew_full_pipeline", digest, script_segment, timestamp, timestamp))
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


_AGENT_LABELS = {
    "screenplay_writer": "CineMeshScreenplayWriter",
    "art_department": "ArtDepartmentAgent",
    "story_editor": "StoryEditorAgent",
    "cinematographer": "CinematographerAgent",
    "dsl_validator": "DSLValidatorAgent",
    "vo_director": "VODirectorAgent",
    "technical_director": "TechnicalDirectorAgent",
    "dailies_reviewer": "DailiesReviewerAgent",
    "production_operator": "ProductionOperatorAgent",
}


def set_agent_stage_run(run_id, stage, status, output=None, error_code=None):
    agent = _AGENT_LABELS.get(stage, stage)
    timestamp = now()
    with connection() as db:
        db.execute("""INSERT INTO agent_stage_runs(run_id,stage,agent,status,output,error_code,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(run_id,stage) DO UPDATE SET agent=excluded.agent,status=excluded.status,
          output=excluded.output,error_code=excluded.error_code,updated_at=excluded.updated_at""",
          (run_id, stage, agent, status, json.dumps(output, ensure_ascii=False) if output is not None else None,
           error_code, timestamp, timestamp))
        db.commit()


def complete_agent_stage_with_checkpoint(run_id, stage, checkpoint, output):
    """Commit stage completion and its resumable output as one database transaction."""
    agent = _AGENT_LABELS.get(stage, stage)
    timestamp = now()
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute(
            "INSERT INTO agent_run_checkpoints VALUES(?,?,?,?) "
            "ON CONFLICT(run_id,stage) DO UPDATE SET output=excluded.output,created_at=excluded.created_at",
            (run_id, stage, json.dumps(checkpoint, ensure_ascii=False), timestamp),
        )
        db.execute(
            "UPDATE agent_runs SET stage=?,updated_at=? WHERE id=? AND status='running'",
            (stage, timestamp, run_id),
        )
        db.execute(
            """INSERT INTO agent_stage_runs(run_id,stage,agent,status,output,error_code,created_at,updated_at)
              VALUES(?,?,?,'completed',?,NULL,?,?)
              ON CONFLICT(run_id,stage) DO UPDATE SET agent=excluded.agent,status='completed',
              output=excluded.output,error_code=NULL,updated_at=excluded.updated_at""",
            (run_id, stage, agent, json.dumps(output, ensure_ascii=False), timestamp, timestamp),
        )
        db.commit()


def get_agent_stage_runs(run_id):
    with connection() as db:
        rows = db.execute("SELECT * FROM agent_stage_runs WHERE run_id=? ORDER BY created_at,stage", (run_id,)).fetchall()
        return [{"stage": row["stage"], "agent": row["agent"], "status": row["status"],
                 "output": json.loads(row["output"]) if row["output"] else None,
                 "error_code": row["error_code"], "created_at": row["created_at"], "updated_at": row["updated_at"]}
                for row in rows]


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
        db.execute("UPDATE agent_stage_runs SET status='failed',error_code=?,updated_at=? WHERE run_id=? AND stage=? AND status='running'",
                   (error_code, now(), run_id, stage))
        db.commit()


def get_agent_run(film_id, run_id):
    with connection() as db:
        row = db.execute("SELECT * FROM agent_runs WHERE id=? AND film_id=?", (run_id, film_id)).fetchone()
        result = _agent_run(row) if row else None
    if result is not None:
        result["stages"] = get_agent_stage_runs(run_id)
    return result


def _jsonable(value):
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _pipeline_snapshot(ctx):
    return {key: _jsonable(ctx.get(key)) for key in (
        "screenplay", "script_content", "script_segment", "asset_library",
        "scene_blueprint", "validation_report", "dailies_report", "video_jobs",
    )}


def _restore_pipeline_context(snapshot):
    if not snapshot:
        return {}
    restored = dict(snapshot)
    if restored.get("asset_library"):
        from src.schemas.assets import AssetLibrary
        restored["asset_library"] = AssetLibrary.model_validate(restored["asset_library"])
    if restored.get("scene_blueprint"):
        from src.schemas.blueprint import SceneBlueprint
        restored["scene_blueprint"] = SceneBlueprint.model_validate(restored["scene_blueprint"])
    if restored.get("screenplay"):
        from src.schemas.screenplay import ScreenplayDraft
        restored["screenplay"] = ScreenplayDraft.model_validate(restored["screenplay"])
    if restored.get("video_jobs"):
        from src.schemas.video_jobs import VideoJobBatch
        restored["video_jobs"] = VideoJobBatch.model_validate(restored["video_jobs"])
    return restored


def _offline_planning_stages(configured):
    """Copy configured stages and force all provider media generation off."""
    stages = [dict(item) for item in configured]
    for item in stages:
        if item.get("id") == "art_department":
            item["generate_references"] = False
        if item.get("id") == "production_operator":
            item["execute"] = False
    return stages


def run_cinecrew_agents(film_id, run_id, film_idea, film_settings, access_token, model):
    binding = json.dumps({"film_idea": film_idea, "film_settings": film_settings, "model": model},
                         ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    claim = claim_story_editor_run(film_id, run_id, film_idea, binding=binding)
    if claim["state"] == "completed":
        return claim["run"]
    if claim["state"] == "running":
        return claim["run"]

    stage = "screenplay_writer"
    run_root = Path(db_path()).resolve().parent / "runs" / film_id / run_id
    trace_configured = False
    heartbeat_stop = None
    heartbeat_thread = None
    try:
        import threading
        from src.pipeline import get_enabled_stages, run_pipeline
        from src.utils.agent_trace import set_trace_output_dir
        from src.utils.chatgpt_plan import chatgpt_plan_session
        from src.schemas.screenplay import ScreenplayDraft

        set_trace_output_dir(run_root / "logs")
        trace_configured = True
        # Keep a long-running real agent run leased so another browser request cannot
        # claim it while an individual model call or critic loop is still active.
        heartbeat_stop = threading.Event()
        def heartbeat():
            while not heartbeat_stop.wait(30):
                try:
                    with connection() as db:
                        db.execute("UPDATE agent_runs SET updated_at=? WHERE id=? AND status='running'", (now(), run_id))
                        db.commit()
                except sqlite3.Error:
                    pass
        heartbeat_thread = threading.Thread(target=heartbeat, name=f"cinecrew-heartbeat-{run_id[:8]}", daemon=True)
        heartbeat_thread.start()

        idea_checkpoint = get_agent_checkpoint(run_id, "screenplay_writer")
        if idea_checkpoint:
            writer_data = idea_checkpoint["screenplay"]
            screenplay = ScreenplayDraft.model_validate(writer_data)
        else:
            writer_data = None
            screenplay = None

        configured = get_enabled_stages()
        if not configured:
            raise RuntimeError("No enabled CineCrew pipeline stages are configured")
        # Planning may create a VideoJobBatch, but provider submissions are a separate
        # cost-gated action and must never happen from this planning endpoint.
        # Keep idea planning offline even if local config changes; image/video
        # generation is a separate user-approved provider action.
        stages = _offline_planning_stages(configured)

        completed = {
            item["stage"] for item in get_agent_stage_runs(run_id)
            if item["status"] == "completed" and get_agent_checkpoint(run_id, item["stage"])
        }
        screenplay_snapshot = {
            "screenplay": writer_data,
            "script_content": screenplay.screenplay if screenplay else film_idea,
            "script_segment": screenplay.screenplay[:20000] if screenplay else film_idea[:20000],
            "film_idea": film_idea,
            "film_title": film_settings["title"],
            "film_genre": film_settings["genre"],
            "duration_minutes": film_settings["duration_minutes"],
            "language": film_settings["language"],
            "visual_style": film_settings["visual_style"],
        }
        if not idea_checkpoint:
            # The stage callback stores this same checkpoint after a successful writer call.
            set_agent_run_stage(run_id, "screenplay_writer")
            set_agent_stage_run(run_id, "screenplay_writer", "running")

        # Find the newest completed full pipeline snapshot to restore the exact FilmDSL,
        # AssetLibrary, and downstream outputs from the last successful stage.
        initial_ctx = dict(screenplay_snapshot)
        for item in stages:
            stage_id = item.get("id")
            if stage_id in completed:
                saved = get_agent_checkpoint(run_id, stage_id)
                if saved:
                    initial_ctx.update(_restore_pipeline_context(saved))

        def persist_stage(stage_id, status, ctx):
            nonlocal stage
            stage = stage_id
            if status == "running":
                set_agent_run_stage(run_id, stage_id)
                set_agent_stage_run(run_id, stage_id, "running")
                return
            snapshot = _pipeline_snapshot(ctx)
            if stage_id == "screenplay_writer":
                snapshot.update({key: screenplay_snapshot[key] for key in screenplay_snapshot if key not in snapshot})
                snapshot["screenplay"] = _jsonable(ctx.get("screenplay") or screenplay)
            if ctx.get("scene_blueprint") is not None:
                save_blueprint(film_id, snapshot["scene_blueprint"])
            blueprint = ctx.get("scene_blueprint")
            summary = {
                "shots": len(getattr(blueprint, "shots", []) or []),
                "characters": len(getattr(ctx.get("asset_library"), "characters", []) or []),
                "locations": len(getattr(ctx.get("asset_library"), "locations", []) or []),
                "video_jobs": len(getattr(ctx.get("video_jobs"), "jobs", []) or []),
            }
            complete_agent_stage_with_checkpoint(run_id, stage_id, snapshot, summary)

        with chatgpt_plan_session(access_token, model):
            if not idea_checkpoint:
                # Run only the actual configured screenplay writer stage first, then
                # checkpoint before any downstream stage begins.
                writer_stage = next((item for item in stages if item.get("id") == "screenplay_writer"), None)
                if writer_stage is None:
                    raise RuntimeError("screenplay_writer must be enabled for idea-to-film runs")
                ctx = run_pipeline(
                    film_idea,
                    stages=[writer_stage],
                    enable_hallucination_guard=True,
                    run_root=run_root,
                    initial_ctx=initial_ctx,
                    stage_callback=persist_stage,
                )
                screenplay = ctx["screenplay"]
                screenplay_snapshot.update(_pipeline_snapshot(ctx))
                screenplay_snapshot["screenplay"] = screenplay.model_dump(mode="json")
                save_agent_checkpoint(run_id, "screenplay_writer", screenplay_snapshot)
                initial_ctx.update(_restore_pipeline_context(screenplay_snapshot))

            remaining = [item for item in stages if item.get("id") != "screenplay_writer" and item.get("id") not in completed]
            if remaining:
                ctx = run_pipeline(
                    screenplay.screenplay,
                    stages=remaining,
                    enable_hallucination_guard=True,
                    dsl_validator_auto_correct=True,
                    run_root=run_root,
                    initial_ctx=initial_ctx,
                    stage_callback=persist_stage,
                )
            else:
                latest = initial_ctx
                ctx = latest
            screenplay = ctx.get("screenplay") or screenplay
            library = ctx.get("asset_library")
            blueprint = ctx.get("scene_blueprint")
            if library is None or blueprint is None:
                raise RuntimeError("CineCrew pipeline did not produce its Film Bible and FilmDSL")
            asset_data = _jsonable(library)
            blueprint_data = _jsonable(blueprint)
            save_blueprint(film_id, blueprint_data)
            result = {
                "run_id": run_id,
                "agent": "CineMeshScreenplayWriter + CineCrew",
                "provider": "chatgpt_plan",
                "model": model,
                "status": "completed",
                "screenplay": _jsonable(screenplay),
                "characters": len(library.characters),
                "locations": len(library.locations),
                "shots": len(blueprint.shots),
                "video_job_count": len(getattr(ctx.get("video_jobs"), "jobs", []) or []),
                "asset_library": asset_data,
                "blueprint": blueprint_data,
                "validation_report": _jsonable(ctx.get("validation_report")),
                "dailies_report": _jsonable(ctx.get("dailies_report")),
                "video_jobs": _jsonable(ctx.get("video_jobs")),
                "stages": get_agent_stage_runs(run_id),
                "provider_submission": {"submitted": False, "reason": "Awaiting explicit plan and spend-ceiling approval"},
            }
            return complete_agent_run(film_id, run_id, result)
    except Exception as error:
        # Keep user screenplay and OAuth credentials out of persisted error messages.
        code = getattr(error, "code", None) or type(error).__name__
        fail_agent_run(run_id, stage, str(code)[:80])
        raise
    finally:
        if heartbeat_stop is not None:
            heartbeat_stop.set()
        if heartbeat_thread is not None:
            heartbeat_thread.join(timeout=2)
        if trace_configured:
            set_trace_output_dir(None)
