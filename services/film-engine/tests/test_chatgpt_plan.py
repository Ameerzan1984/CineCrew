# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from types import SimpleNamespace

from pydantic import BaseModel
import pytest

from src.utils.chatgpt_plan import ChatGPTPlanClient, chatgpt_plan_session, current_chatgpt_plan_session


class Output(BaseModel):
    message: str


class Stream:
    def __init__(self, events):
        self.events = events

    def __enter__(self):
        return iter(self.events)

    def __exit__(self, *_args):
        return False


def test_responses_stream_is_validated_and_uses_plan_requirements():
    calls = {}
    usage = SimpleNamespace(input_tokens=11, output_tokens=7, total_tokens=18)
    completed = SimpleNamespace(usage=usage)
    events = [
        SimpleNamespace(type="response.output_text.delta", delta='{"message":"ready"}'),
        SimpleNamespace(type="response.completed", response=completed),
    ]

    class Responses:
        def create(self, **kwargs):
            calls.update(kwargs)
            return Stream(events)

    def factory(**kwargs):
        assert kwargs["api_key"] == "request-scoped-token"
        return SimpleNamespace(responses=Responses())

    result = ChatGPTPlanClient("request-scoped-token", "account-model", client_factory=factory).generate_structured(
        Output, "system instructions", "user input", model="yaml-override"
    )

    assert result.content.message == "ready"
    assert result.usage.to_dict() == {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18, "cache_hit_tokens": 0}
    assert calls["model"] == "account-model"
    assert calls["instructions"] == "system instructions"
    assert calls["store"] is False and calls["stream"] is True
    assert calls["text"] == {"format": {"type": "json_object"}}
    assert "max_output_tokens" not in calls and "max_completion_tokens" not in calls


def test_chatgpt_plan_adapter_requires_a_completed_stream():
    class Responses:
        def create(self, **_kwargs):
            return Stream([SimpleNamespace(type="response.output_text.delta", delta='{"message":"ready"}')])

    client = ChatGPTPlanClient("token", "model", client_factory=lambda **_kwargs: SimpleNamespace(responses=Responses()))
    with pytest.raises(RuntimeError, match="response.completed"):
        client.generate_structured(Output, "instructions", "input")


def test_job_scoped_credentials_reset_even_after_exception():
    assert current_chatgpt_plan_session() is None
    with pytest.raises(RuntimeError):
        with chatgpt_plan_session("secret-token", "selected-model"):
            assert current_chatgpt_plan_session() == ("secret-token", "selected-model")
            raise RuntimeError("stop")
    assert current_chatgpt_plan_session() is None
