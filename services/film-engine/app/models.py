# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from typing import Literal
from pydantic import BaseModel, Field


class FilmCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    premise: str = Field(min_length=1, max_length=4000)
    genre: str = Field(default="Drama", max_length=80)
    duration_minutes: int = Field(default=5, ge=1, le=120)
    language: str = Field(default="en", min_length=2, max_length=20)
    visual_style: str = Field(default="Cinematic", max_length=160)
    mode: Literal["automatic", "professional", "collaborative"] = "automatic"


class AdvanceRequest(BaseModel):
    # An optional key makes a retry return the original checkpoint.
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=128)


class FilmUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    premise: str | None = Field(default=None, min_length=1, max_length=4000)
    genre: str | None = Field(default=None, max_length=80)
    visual_style: str | None = Field(default=None, max_length=160)


class StoryEditorRunRequest(BaseModel):
    run_id: str = Field(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    script_segment: str = Field(min_length=20, max_length=20000)
