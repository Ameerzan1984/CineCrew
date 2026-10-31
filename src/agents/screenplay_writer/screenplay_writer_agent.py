#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Turn a film idea and project constraints into a structured screenplay draft."""

from pathlib import Path

from ...engine import ConfigurableAgent
from ...schemas.screenplay import ScreenplayDraft


_HERE = Path(__file__).resolve().parent


class ScreenplayWriterAgent:
    """Write a scene-ready screenplay draft before the CineCrew planning cascade."""

    def __init__(self):
        self._agent = ConfigurableAgent(config_path=str(_HERE / "screenplay_writer.yaml"))

    def run(self, *, film_idea: str, title: str, genre: str, duration_minutes: int,
            language: str, visual_style: str) -> ScreenplayDraft:
        result = self._agent.run(
            film_idea=film_idea,
            title=title,
            genre=genre,
            duration_minutes=duration_minutes,
            language=language,
            visual_style=visual_style,
        )
        if not isinstance(result, ScreenplayDraft):
            raise TypeError("ScreenplayWriterAgent returned an unexpected schema")
        return result
