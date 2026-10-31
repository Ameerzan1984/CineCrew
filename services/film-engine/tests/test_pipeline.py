#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0

from src.schemas.screenplay import ScreenplayDraft
import src.agents.screenplay_writer as screenplay_writer_module
from src.pipeline import get_enabled_stages, run_pipeline
from app.storage import _offline_planning_stages


def test_screenplay_writer_stage_expands_idea_and_reports_checkpoints(tmp_path, monkeypatch):
    screenplay_text = "INT. LIGHTHOUSE - NIGHT\n\n" + ("A keeper follows a strange blue light through the tower.\n" * 4)

    class FakeWriter:
        def run(self, **_kwargs):
            return ScreenplayDraft(title="Blue Light", logline="A keeper investigates a light.", screenplay=screenplay_text)

    monkeypatch.setattr(screenplay_writer_module, "ScreenplayWriterAgent", FakeWriter)
    events = []
    result = run_pipeline(
        "A lighthouse keeper sees a blue light.",
        stages=[{"id": "screenplay_writer", "enabled": True}],
        script_segment_max_len=20000,
        run_root=tmp_path,
        initial_ctx={
            "film_idea": "A lighthouse keeper sees a blue light.",
            "film_title": "Blue Light",
            "film_genre": "Mystery",
            "duration_minutes": 1,
            "language": "en",
            "visual_style": "Cinematic",
        },
        stage_callback=lambda stage, status, _ctx: events.append((stage, status)),
    )

    assert result["script_content"] == screenplay_text
    assert result["script_segment"] == screenplay_text
    assert result["screenplay"].title == "Blue Light"
    assert events == [("screenplay_writer", "running"), ("screenplay_writer", "completed")]


def test_full_cinecrew_order_follows_screenplay_writer_and_dsl_dependencies():
    ids = [stage["id"] for stage in get_enabled_stages()]
    assert ids == [
        "screenplay_writer", "art_department", "story_editor", "cinematographer",
        "dsl_validator", "vo_director", "technical_director", "dailies_reviewer",
        "production_operator",
    ]


def test_idea_planning_always_disables_paid_media_stages():
    configured = [
        {"id": "art_department", "generate_references": True},
        {"id": "production_operator", "execute": True},
    ]
    stages = _offline_planning_stages(configured)
    assert stages == [
        {"id": "art_department", "generate_references": False},
        {"id": "production_operator", "execute": False},
    ]
    assert configured[0]["generate_references"] is True
    assert configured[1]["execute"] is True
