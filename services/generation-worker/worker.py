# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Trusted, provider-neutral worker primitive; it does not configure a provider."""
from dataclasses import dataclass
from pathlib import Path
import re
from threading import Event, Thread
from typing import Callable, Protocol


@dataclass(frozen=True)
class GenerationTask:
    """A claimed task without the lease token or provider credentials."""
    job_id: str
    project_id: str
    shot_id: str
    resource_id: str
    resource_owner_id: str
    provider_request_key: str
    capability: str


@dataclass(frozen=True)
class GenerationResult:
    """Provider-reported cost and either a private ref or a local media file.

    Cost uses the scheduler's existing currency millionths; this type does not
    convert currencies or represent MCP plan credits. When local_media_path is
    set, GenerationWorker must have a private object storage adapter and will
    persist it before settlement. The provider-supplied result_ref is omitted
    for that path; the worker chooses a task-scoped object name.
    """
    actual_micros: int
    result_ref: str | None = None
    local_media_path: str | Path | None = None
    content_type: str = "application/octet-stream"


@dataclass(frozen=True)
class WorkerOutcome:
    status: str
    job_id: str | None = None


class DefinitiveNotSubmitted(Exception):
    """Trusted adapter asserts the provider neither accepted nor charged a request."""


class Provider(Protocol):
    def execute(self, task: GenerationTask) -> GenerationResult:
        """Execute once and return a private reference or local media file.

        Only raise DefinitiveNotSubmitted when non-acceptance and no charge are
        known. All other exceptions are treated as potentially billable. The
        adapter is responsible for durably recording any provider job ID and
        associating it with this job and resource owner before polling. If it
        returns a local_media_path, the worker persists it through its private
        object storage boundary before settling the job. It must resolve
        credentials only for the claimed resource owner, and may use
        provider_request_key for idempotency only if the provider supports it.
        """


class PrivateObjectStorage(Protocol):
    """Private storage boundary used to persist a provider's local result."""

    def put_file(self, object_name: str, path: str | Path,
                 content_type: str = "application/octet-stream") -> str:
        """Upload a file and return its private logical object reference."""


def _private_reference(value: object) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,1023}", value):
        return False
    return all(part not in ("", ".", "..") for part in value.split("/"))


class GenerationWorker:
    """Run one provider call per claim and fence work with a renewable lease.

    authorize is a required, read-only trusted host callback. It must validate
    the current contributor, connection, task and spend approval; this library does not
    establish a provider's cost, permission, or revocation semantics. The host
    must address the race between a revocation and an external submission. The
    host supervises database errors and must redact credentials from its logs.
    """
    def __init__(self, scheduler, provider: Provider, authorize: Callable[[GenerationTask], bool],
                 lease_seconds: int = 300, heartbeat_interval: float | None = None,
                 object_storage: PrivateObjectStorage | None = None):
        if not callable(authorize):
            raise ValueError("authorization callback is required")
        if not isinstance(lease_seconds, int) or isinstance(lease_seconds, bool) or not 1 <= lease_seconds <= 3600:
            raise ValueError("invalid lease")
        interval = lease_seconds / 3 if heartbeat_interval is None else heartbeat_interval
        if isinstance(interval, bool) or not isinstance(interval, (int, float)) or not 0 < interval < lease_seconds:
            raise ValueError("invalid heartbeat interval")
        self.scheduler = scheduler
        self.provider = provider
        self.authorize = authorize
        self.lease_seconds = lease_seconds
        self.heartbeat_interval = interval
        self.object_storage = object_storage

    def _persist_result(self, task: GenerationTask, result: object) -> GenerationResult:
        if (not isinstance(result, GenerationResult)
                or type(result.actual_micros) is not int or result.actual_micros < 0):
            raise ValueError("invalid provider result")

        if result.local_media_path is not None:
            if (self.object_storage is None or result.result_ref is not None
                    or not isinstance(result.local_media_path, (str, Path))):
                raise ValueError("local provider media requires private object storage")
            object_name = f"projects/{task.project_id}/jobs/{task.job_id}/result"
            if not _private_reference(object_name):
                raise ValueError("invalid task-scoped object name")
            stored_ref = self.object_storage.put_file(
                object_name, result.local_media_path, result.content_type)
            if stored_ref != object_name or not _private_reference(stored_ref):
                raise ValueError("storage returned an invalid private reference")
            return GenerationResult(result.actual_micros, result_ref=stored_ref)

        if not _private_reference(result.result_ref):
            raise ValueError("provider result must identify a private object")
        return result

    def _fail(self, claim, definitive: bool, status: str) -> WorkerOutcome:
        try:
            self.scheduler.fail(claim['job_id'], claim['lease_token'], definitive=definitive)
        except Exception:
            # A failed database response can itself be ambiguous. Never resubmit.
            return WorkerOutcome("settlement_pending", claim['job_id'])
        return WorkerOutcome(status, claim['job_id'])

    def run_once(self, project_id: str, stop: Event | None = None) -> WorkerOutcome:
        if stop is not None and stop.is_set():
            return WorkerOutcome("stopped")
        # An interrupted worker's expired claim is never requeued blindly.
        # It becomes uncertain until a trusted operator reconciles it.
        self.scheduler.expire_leases()
        if stop is not None and stop.is_set():
            return WorkerOutcome("stopped")
        claim = self.scheduler.claim(project_id, lease_seconds=self.lease_seconds)
        if claim is None:
            return WorkerOutcome("idle")
        task = GenerationTask(**{key: claim[key] for key in GenerationTask.__dataclass_fields__})
        try:
            allowed = self.authorize(task) is True
        except Exception:
            allowed = False
        if not allowed:
            # No provider call has happened. The scheduler's bounded retry policy
            # may requeue the task, but each attempt must pass authorization again.
            return self._fail(claim, True, "authorization_denied")

        if stop is not None and stop.is_set():
            return self._fail(claim, True, "stopped")

        try:
            self.scheduler.renew_lease(task.job_id, claim['lease_token'], self.lease_seconds)
        except Exception:
            # Without a current lease there must be no provider submission.
            return WorkerOutcome("lease_lost", task.job_id)

        if stop is not None and stop.is_set():
            return self._fail(claim, True, "stopped")

        heartbeat_stop, lost = Event(), Event()
        def heartbeat():
            while not heartbeat_stop.wait(self.heartbeat_interval):
                try:
                    self.scheduler.renew_lease(task.job_id, claim['lease_token'], self.lease_seconds)
                except Exception:
                    lost.set()
                    return

        thread = Thread(target=heartbeat, name="generation-lease-heartbeat", daemon=True)
        thread.start()
        result = None
        failure = None
        try:
            if stop is not None and stop.is_set():
                failure = "stopped"
            else:
                result = self.provider.execute(task)
        except DefinitiveNotSubmitted:
            failure = "not_submitted"
        except Exception:
            failure = "uncertain"
        else:
            # Storage runs while the lease heartbeat is still active. Once the
            # provider has succeeded, any local persistence error is ambiguous
            # and must never be classified as a safe-to-retry submission.
            if failure is None:
                try:
                    result = self._persist_result(task, result)
                except Exception:
                    failure = "uncertain"
        finally:
            heartbeat_stop.set()
            thread.join(timeout=min(5.0, max(0.25, self.heartbeat_interval)))
        if lost.is_set() or thread.is_alive():
            # The provider may have accepted or charged the request. Let the
            # expired claim become uncertain and reconcile it before any retry.
            return WorkerOutcome("lease_lost", task.job_id)
        if failure == "stopped":
            return self._fail(claim, True, "stopped")
        if failure == "not_submitted":
            # The scheduler may requeue or permanently fail an exhausted job.
            return self._fail(claim, True, "not_submitted")
        if failure or not isinstance(result, GenerationResult):
            return self._fail(claim, False, "uncertain")
        try:
            self.scheduler.finish(task.job_id, claim['lease_token'], result.actual_micros, result.result_ref)
        except Exception:
            # The transaction might have committed despite a lost response.
            return WorkerOutcome("settlement_pending", task.job_id)
        return WorkerOutcome("completed", task.job_id)

    def run_forever(self, project_id: str, stop: Event, idle_seconds: float = 1.0) -> None:
        """Stop before dispatch when observed; never cancel an in-flight provider job."""
        if isinstance(idle_seconds, bool) or not isinstance(idle_seconds, (int, float)) or not 0 < idle_seconds <= 3600:
            raise ValueError("invalid idle interval")
        while not stop.is_set():
            if self.run_once(project_id, stop=stop).status == "idle":
                stop.wait(idle_seconds)
