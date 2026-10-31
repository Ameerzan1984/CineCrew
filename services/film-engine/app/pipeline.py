# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Deterministic offline planning adapter.

Outputs are intentionally labelled drafts. In particular, no media, rendering,
AI model or external provider is claimed to have been invoked.
"""
from datetime import datetime, timezone

STAGES = [
    ("idea", "Idea Development", "story"),
    ("outline", "Story Outline", "story"),
    ("screenplay", "Full Screenplay", "story"),
    ("bible", "Film Bible", "director"),
    ("characters", "Character Design", "character"),
    ("locations", "Location Design", "production_design"),
    ("storyboard", "Storyboard", "storyboard"),
    ("breakdown", "Scene Breakdown", "director"),
    ("shots", "Shot Planning", "cinematography"),
    ("generation", "Video Generation", "generation"),
    ("quality", "Quality Control", "quality"),
    ("audio", "Dialogue & Voice", "audio"),
    ("sound", "Music & Sound Design", "audio"),
    ("editing", "Film Editing", "editing"),
    ("render", "Final Rendering", "editing"),
    ("publishing", "Publishing", "publishing"),
]


def make_output(stage: str, film: dict) -> dict:
    title, premise = film["title"], film["premise"]
    base = {"kind": "offline_draft", "generated_at": datetime.now(timezone.utc).isoformat()}
    # These are editable production guides, not synthetic claims of finished media.
    outputs = {
        "idea": {"logline": premise, "genre": film["genre"], "title": title},
        "outline": {"acts": [
            {"number": 1, "purpose": "Establish the world and central conflict"},
            {"number": 2, "purpose": "Escalate choices and consequences"},
            {"number": 3, "purpose": "Resolve the central conflict"}]},
        "screenplay": {"version": 1, "status": "outline_only", "note": "A screenplay writer or connected model must expand the outline."},
        "bible": {"premise": premise, "visual_style": film["visual_style"], "language": film["language"], "continuity_notes": []},
        "characters": {"characters": [], "required_fields": ["name", "appearance", "wardrobe", "personality", "voice", "relationships", "arc", "references"]},
        "locations": {"locations": [], "required_fields": ["name", "environment", "time", "lighting", "weather", "props", "continuity_notes"]},
        "storyboard": {"boards": [], "note": "Add references or generate boards with a connected provider."},
        "breakdown": {"scenes": [], "note": "Scenes must be added from an approved screenplay."},
        "shots": {"shots": [], "note": "Plan shots after scene breakdown."},
        "generation": {"jobs": [], "provider": "mock", "status": "not_submitted", "note": "No video has been generated."},
        "quality": {"reports": [], "status": "pending_media"},
        "audio": {"tracks": [], "status": "pending_assets"},
        "sound": {"tracks": [], "status": "pending_assets"},
        "editing": {"timeline": [], "status": "pending_assets"},
        "render": {"manifest": None, "status": "not_rendered"},
        "publishing": {"status": "not_published", "note": "Publishing requires an approved render."},
    }
    return {**base, **outputs[stage]}
