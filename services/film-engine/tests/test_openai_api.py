# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
import json

import pytest

import src.utils as llm_utils
from app import storage
from src.utils.chatgpt_plan import chatgpt_plan_session
from src.utils.openai_api_session import current_openai_api_session, openai_api_session


def test_openai_credentials_are_context_scoped_and_not_in_repr():
    barrier = Barrier(2)
    def worker(key, model):
        with openai_api_session(key, model):
            barrier.wait(timeout=5)
            current = current_openai_api_session()
            assert key not in repr(current)
            return current.api_key, current.model
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(worker, "first-test-secret", "model-one")
        second = pool.submit(worker, "second-test-secret", "model-two")
        assert first.result() == ("first-test-secret", "model-one")
        assert second.result() == ("second-test-secret", "model-two")
    assert current_openai_api_session() is None


def test_openai_client_uses_selected_model_and_rejects_endpoint_override(monkeypatch):
    captured = {}
    class FakeInstructor:
        def create_with_completion(self, **kwargs):
            captured["kwargs"] = kwargs
            return "validated-output", SimpleNamespace(usage=None)
    def fake_openai(**kwargs):
        captured["client"] = kwargs
        return object()
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.setattr(llm_utils, "OpenAI", fake_openai)
    monkeypatch.setattr(llm_utils.instructor, "from_openai", lambda *_args, **_kwargs: FakeInstructor())
    with openai_api_session("test-key", "selected-model"):
        client = llm_utils.get_llm_client()
        llm_utils.generate_structured_data(client, str, "system", "idea", model="yaml-override")
        assert captured["client"]["api_key"] == "test-key"
        assert captured["client"]["max_retries"] == 0
        assert captured["kwargs"]["model"] == "selected-model"
        monkeypatch.setenv("OPENAI_BASE_URL", "untrusted-override")
        with pytest.raises(RuntimeError, match="must be unset"):
            llm_utils.get_llm_client()
    monkeypatch.delenv("OPENAI_BASE_URL")
    with openai_api_session("test-key", "model"), chatgpt_plan_session("plan-key", "model"):
        with pytest.raises(RuntimeError, match="Only one"):
            llm_utils.get_llm_client()


def test_run_binding_distinguishes_api_from_chatgpt_without_credentials(monkeypatch):
    bindings = []
    def claim(_film_id, _run_id, _idea, binding):
        bindings.append(json.loads(binding))
        return {"state": "completed", "run": {"status": "completed"}}
    monkeypatch.setattr(storage, "claim_story_editor_run", claim)
    settings = {"title": "Test"}
    storage.run_cinecrew_agents("film", "run", "idea", settings, "private-test-key", "model", provider="openai_api")
    storage.run_cinecrew_agents("film", "run", "idea", settings, "private-test-key", "model")
    assert bindings[0]["provider"] == "openai_api"
    assert "provider" not in bindings[1]  # preserves previously saved ChatGPT bindings
    assert "private-test-key" not in json.dumps(bindings)
    with pytest.raises(ValueError, match="Unsupported"):
        storage.run_cinecrew_agents("film", "run", "idea", settings, "private-test-key", "model", provider="unknown")
