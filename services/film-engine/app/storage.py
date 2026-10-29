# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
import json
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
        """)


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
        db.execute("INSERT INTO blueprints VALUES (?, ?, ?) ON CONFLICT(film_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                   (film_id, json.dumps(data, ensure_ascii=False), now()))
        db.commit()


def get_blueprint(film_id):
    with connection() as db:
        row = db.execute("SELECT data FROM blueprints WHERE film_id = ?", (film_id,)).fetchone()
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
