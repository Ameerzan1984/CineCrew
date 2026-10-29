#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Job-scoped Responses API adapter for Sign in with ChatGPT plan usage."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import time
from typing import Optional

from pydantic import BaseModel

from .types import LLMResult, TokenUsage


_credentials: ContextVar[tuple[str, str] | None] = ContextVar("chatgpt_plan_credentials", default=None)


@contextmanager
def chatgpt_plan_session(access_token: str, model: str):
    """Set credentials only for the current request/job; never writes them to Config or traces."""
    if not access_token or not model:
        raise ValueError("A connected ChatGPT plan and selected model are required")
    marker = _credentials.set((access_token, model))
    try:
        yield
    finally:
        _credentials.reset(marker)


def current_chatgpt_plan_session() -> tuple[str, str] | None:
    return _credentials.get()


@dataclass
class ChatGPTPlanClient:
    """Uses only the documented Responses API route, with no model tools enabled."""

    access_token: str
    selected_model: str
    timeout: float = 600
    client_factory: object | None = None

    provider_name = "chatgpt_plan"

    def generate_structured(
        self,
        model_class: type[BaseModel],
        system_prompt: str,
        user_content: str,
        model: Optional[str] = None,
        images: Optional[list[str]] = None,
    ) -> LLMResult:
        if images:
            raise ValueError("ChatGPT plan usage in this CineMesh integration currently supports text-only agents")
        if model and model != self.selected_model:
            # An agent YAML override must not silently select a model outside the user's catalog.
            model = self.selected_model
        started = time.perf_counter()
        factory = self.client_factory
        if factory is None:
            from openai import OpenAI
            factory = OpenAI
        client = factory(api_key=self.access_token, base_url="https://api.openai.com/v1", timeout=self.timeout, max_retries=0)
        pieces: list[str] = []
        completed = None
        stream = client.responses.create(
            model=self.selected_model,
            instructions=system_prompt,
            input=[{"role": "user", "content": user_content}],
            text={"format": {"type": "json_object"}},
            store=False,
            stream=True,
        )
        with stream as events:
            for event in events:
                event_type = getattr(event, "type", "")
                if event_type == "response.output_text.delta":
                    delta = getattr(event, "delta", "")
                    if isinstance(delta, str):
                        pieces.append(delta)
                elif event_type == "response.failed":
                    error = getattr(getattr(event, "response", None), "error", None)
                    code = getattr(error, "code", None)
                    raise RuntimeError(f"ChatGPT plan request failed{f' ({code})' if code else ''}")
                elif event_type == "response.incomplete":
                    raise RuntimeError("ChatGPT returned an incomplete response")
                elif event_type == "response.completed":
                    completed = getattr(event, "response", None)
        if completed is None:
            raise RuntimeError("ChatGPT stream ended before response.completed")
        raw_json = "".join(pieces)
        if not raw_json:
            raise RuntimeError("ChatGPT completed without structured output")
        content = model_class.model_validate_json(raw_json)
        usage_data = getattr(completed, "usage", None)
        usage = TokenUsage(
            prompt_tokens=getattr(usage_data, "input_tokens", 0) or 0,
            completion_tokens=getattr(usage_data, "output_tokens", 0) or 0,
            total_tokens=getattr(usage_data, "total_tokens", 0) or 0,
        )
        return LLMResult(content=content, usage=usage, latency=time.perf_counter() - started, raw_response=None)
