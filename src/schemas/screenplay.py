#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Structured output for CineMesh's idea-to-screenplay stage."""

from pydantic import BaseModel, Field


class ScreenplayDraft(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    logline: str = Field(min_length=1, max_length=1000)
    screenplay: str = Field(min_length=100, max_length=20000)
