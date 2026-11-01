# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Request-scoped user credentials for the official OpenAI API."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field


@dataclass(frozen=True)
class OpenAIAPISession:
    api_key: str = field(repr=False)
    model: str


_session: ContextVar[OpenAIAPISession | None] = ContextVar("cinemesh_openai_api_session", default=None)


@contextmanager
def openai_api_session(api_key: str, model: str):
    if not api_key or not model:
        raise ValueError("An OpenAI API credential and selected model are required")
    token = _session.set(OpenAIAPISession(api_key=api_key, model=model))
    try:
        yield
    finally:
        _session.reset(token)


def current_openai_api_session() -> OpenAIAPISession | None:
    return _session.get()
