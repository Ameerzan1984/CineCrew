# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from pathlib import Path
import sys
from threading import Event
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from worker import DefinitiveNotSubmitted, GenerationResult, GenerationWorker
from test_scheduler import pg_scheduler


def claim():
    return dict(job_id='job', project_id='film', shot_id='shot', resource_id='resource',
                resource_owner_id='owner', provider_request_key='request', lease_token='secret-lease', capability='video')


class FakeScheduler:
    def __init__(self, renew_fails_at=None, finish_fails=False, events=None):
        self.pending = claim()
        self.events = events if events is not None else []
        self.renew_calls = 0
        self.renew_failed = Event()
        self.renew_fails_at = renew_fails_at
        self.finish_fails = finish_fails
        self.finished = []
        self.failed = []
        self.sweeps = 0

    def claim(self, project, lease_seconds):
        result, self.pending = self.pending, None
        return result

    def expire_leases(self):
        self.sweeps += 1
        return []

    def renew_lease(self, job_id, token, lease_seconds):
        self.renew_calls += 1
        if self.renew_calls == self.renew_fails_at:
            self.renew_failed.set()
            raise RuntimeError('database is unavailable')

    def finish(self, job_id, token, actual_micros, result_ref):
        self.events.append(("finish", result_ref))
        self.finished.append((job_id, token, actual_micros, result_ref))
        if self.finish_fails:
            raise RuntimeError('commit response was lost')

    def fail(self, job_id, token, definitive):
        self.failed.append((job_id, token, definitive))


class FakeProvider:
    def __init__(self, action):
        self.action = action
        self.tasks = []

    def execute(self, task):
        self.tasks.append(task)
        return self.action(task)


class FakeObjectStorage:
    def __init__(self, events=None, upload_error=False, returned_ref=None):
        self.events = events if events is not None else []
        self.upload_error = upload_error
        self.returned_ref = returned_ref
        self.uploads = []

    def put_file(self, object_name, path, content_type="application/octet-stream"):
        self.events.append(("upload", object_name))
        self.uploads.append((object_name, path, content_type))
        if self.upload_error:
            raise RuntimeError("synthetic object storage failure")
        return object_name if self.returned_ref is None else self.returned_ref


def worker(scheduler, provider, authorize=lambda task: True, object_storage=None):
    return GenerationWorker(scheduler, provider, authorize, lease_seconds=1,
                            heartbeat_interval=0.01, object_storage=object_storage)


def test_worker_completes_with_authorized_owner_and_private_result():
    scheduler = FakeScheduler()
    provider = FakeProvider(lambda task: GenerationResult(42, 'film/renders/clip.mp4'))
    outcome = worker(scheduler, provider, lambda task: task.resource_owner_id == 'owner').run_once('film')
    assert outcome.status == 'completed'
    assert scheduler.sweeps == 1
    assert scheduler.renew_calls >= 1
    assert scheduler.finished == [('job', 'secret-lease', 42, 'film/renders/clip.mp4')]
    assert scheduler.failed == []
    assert provider.tasks[0].resource_id == 'resource'
    assert not hasattr(provider.tasks[0], 'lease_token')


def test_existing_logical_reference_provider_skips_optional_storage():
    scheduler = FakeScheduler()
    storage = FakeObjectStorage()
    provider = FakeProvider(lambda task: GenerationResult(
        42, result_ref="already/private/clip.mp4"))

    outcome = worker(scheduler, provider, object_storage=storage).run_once("film")

    assert outcome.status == "completed"
    assert storage.uploads == []
    assert scheduler.finished == [
        ("job", "secret-lease", 42, "already/private/clip.mp4")]


def test_worker_uploads_local_media_before_finishing_with_logical_reference(tmp_path):
    events = []
    scheduler = FakeScheduler(events=events)
    storage = FakeObjectStorage(events=events)
    media_path = tmp_path / "provider-output.mp4"
    media_path.write_bytes(b"synthetic media")
    provider = FakeProvider(lambda task: GenerationResult(
        42, local_media_path=media_path, content_type="video/mp4"))

    outcome = worker(scheduler, provider, object_storage=storage).run_once("film")

    logical_ref = "projects/film/jobs/job/result"
    assert outcome.status == "completed"
    assert storage.uploads == [(logical_ref, media_path, "video/mp4")]
    assert scheduler.finished == [("job", "secret-lease", 42, logical_ref)]
    assert events == [("upload", logical_ref), ("finish", logical_ref)]
    assert "://" not in scheduler.finished[0][3]
    assert scheduler.failed == []


def test_local_media_upload_failure_keeps_job_uncertain_without_retry():
    scheduler = FakeScheduler()
    storage = FakeObjectStorage(upload_error=True)
    provider = FakeProvider(lambda task: GenerationResult(
        42, local_media_path="provider-output.mp4", content_type="video/mp4"))
    runner = worker(scheduler, provider, object_storage=storage)

    assert runner.run_once("film").status == "uncertain"
    assert scheduler.finished == []
    assert scheduler.failed == [("job", "secret-lease", False)]
    assert runner.run_once("film").status == "idle"
    assert len(provider.tasks) == 1


def test_local_media_requires_storage_and_rejects_nonlogical_storage_result():
    scheduler = FakeScheduler()
    provider = FakeProvider(lambda task: GenerationResult(
        42, local_media_path="provider-output.mp4"))
    assert worker(scheduler, provider).run_once("film").status == "uncertain"
    assert scheduler.finished == []
    assert scheduler.failed == [("job", "secret-lease", False)]

    scheduler = FakeScheduler()
    provider = FakeProvider(lambda task: GenerationResult(
        42, local_media_path="provider-output.mp4"))
    storage = FakeObjectStorage(returned_ref="https://example.invalid/media?token=secret")
    assert worker(scheduler, provider, object_storage=storage).run_once("film").status == "uncertain"
    assert scheduler.finished == []
    assert scheduler.failed == [("job", "secret-lease", False)]


def test_worker_denies_unapproved_task_without_calling_provider():
    scheduler = FakeScheduler()
    provider = FakeProvider(lambda task: pytest.fail('unapproved provider call'))
    assert worker(scheduler, provider, lambda task: False).run_once('film').status == 'authorization_denied'
    assert provider.tasks == []
    assert scheduler.failed == [('job', 'secret-lease', True)]


def test_worker_fails_closed_when_authorization_check_errors():
    scheduler = FakeScheduler()
    provider = FakeProvider(lambda task: pytest.fail('provider call after authorization error'))
    def unavailable(_task):
        raise RuntimeError('authorization store unavailable')
    assert worker(scheduler, provider, unavailable).run_once('film').status == 'authorization_denied'
    assert provider.tasks == []
    assert scheduler.failed == [('job', 'secret-lease', True)]


@pytest.mark.parametrize('error, expected, definitive', [
    (DefinitiveNotSubmitted(), 'not_submitted', True),
    (TimeoutError(), 'uncertain', False),
])
def test_worker_retries_only_confirmed_non_submissions(error, expected, definitive):
    scheduler = FakeScheduler()
    def fail(_task):
        raise error
    outcome = worker(scheduler, FakeProvider(fail)).run_once('film')
    assert outcome.status == expected
    assert scheduler.failed == [('job', 'secret-lease', definitive)]
    assert scheduler.finished == []


@pytest.mark.parametrize('result', [
    GenerationResult(1, 'https://example.invalid/video?token=secret'),
    GenerationResult(1, '../outside'),
    GenerationResult(True, 'private/clip'),
    GenerationResult(-1, 'private/clip'),
    {'cost': 1, 'result': 'private/clip'},
])
def test_worker_treats_invalid_provider_result_as_uncertain(result):
    scheduler = FakeScheduler()
    assert worker(scheduler, FakeProvider(lambda task: result)).run_once('film').status == 'uncertain'
    assert scheduler.failed == [('job', 'secret-lease', False)]


def test_worker_does_not_submit_after_initial_lease_renewal_fails():
    scheduler = FakeScheduler(renew_fails_at=1)
    provider = FakeProvider(lambda task: pytest.fail('provider call after lease loss'))
    assert worker(scheduler, provider).run_once('film').status == 'lease_lost'
    assert provider.tasks == []
    assert scheduler.failed == []


def test_worker_does_not_settle_or_retry_after_heartbeat_loss():
    scheduler = FakeScheduler(renew_fails_at=2)
    def generate(_task):
        assert scheduler.renew_failed.wait(timeout=2)
        return GenerationResult(10, 'private/clip')
    assert worker(scheduler, FakeProvider(generate)).run_once('film').status == 'lease_lost'
    assert scheduler.finished == []
    assert scheduler.failed == []


def test_lost_finish_response_is_not_followed_by_failure_or_resubmission():
    scheduler = FakeScheduler(finish_fails=True)
    provider = FakeProvider(lambda task: GenerationResult(5, 'private/clip'))
    runner = worker(scheduler, provider)
    assert runner.run_once('film').status == 'settlement_pending'
    assert runner.run_once('film').status == 'idle'
    assert len(provider.tasks) == 1
    assert scheduler.failed == []


def test_loop_stops_between_jobs_without_cancelling_inflight_work():
    scheduler = FakeScheduler()
    stop = Event()
    def generate(_task):
        stop.set()
        return GenerationResult(5, 'private/clip')
    provider = FakeProvider(generate)
    worker(scheduler, provider).run_forever('film', stop, idle_seconds=0.01)
    assert len(provider.tasks) == 1
    assert len(scheduler.finished) == 1


def test_stop_observed_during_authorization_prevents_provider_submission():
    scheduler = FakeScheduler()
    stop = Event()
    provider = FakeProvider(lambda task: pytest.fail('provider call after stop'))
    def authorize(_task):
        stop.set()
        return True
    result = worker(scheduler, provider, authorize).run_once('film', stop=stop)
    assert result.status == 'stopped'
    assert provider.tasks == []
    assert scheduler.failed == [('job', 'secret-lease', True)]


def test_two_contributors_run_distinct_fake_jobs_with_separate_ledger_entries(pg_scheduler):
    scheduler, owner, project = pg_scheduler
    other = str(uuid4())
    def authorize(actor, target, _action):
        if actor not in (owner, other) or target != project:
            raise PermissionError('denied')
    scheduler.authorize = authorize
    for actor in (owner, other):
        resource = scheduler.register_resource(actor, 'fake-provider', ['video'], 'USD')
        scheduler.grant(actor, project, resource, 100)
    jobs = [scheduler.enqueue(owner, project, f'shot-{i}', f'key-{i}', 'video', 'USD', 30) for i in range(2)]
    provider = FakeProvider(lambda task: GenerationResult(20, f'private/{task.job_id}.mp4'))
    runner = GenerationWorker(scheduler, provider, lambda task: task.resource_owner_id in (owner, other), lease_seconds=30, heartbeat_interval=1)
    assert [runner.run_once(project).status for _ in jobs] == ['completed', 'completed']
    assert {task.resource_owner_id for task in provider.tasks} == {owner, other}
    assert scheduler.progress(owner, project) == {'completed': 2}
    with scheduler.connect() as conn, conn.cursor() as cur:
        cur.execute('''SELECT g.owner_id,l.actual_micros FROM generation_ledger l
            JOIN generation_grants g ON g.id=l.grant_id WHERE l.job_id=ANY(%s::uuid[])''', (jobs,))
        assert {(str(row['owner_id']), row['actual_micros']) for row in cur.fetchall()} == {(owner, 20), (other, 20)}


def test_expired_worker_claim_requires_reconciliation_before_fake_resubmission(pg_scheduler):
    scheduler, owner, project = pg_scheduler
    resource = scheduler.register_resource(owner, 'fake-provider', ['video'], 'USD')
    scheduler.grant(owner, project, resource, 100)
    job = scheduler.enqueue(owner, project, 'shot', 'key', 'video', 'USD', 30)
    scheduler.claim(project, lease_seconds=1)
    with scheduler.connect() as conn, conn.cursor() as cur:
        cur.execute("UPDATE generation_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=%s", (job,))
    provider = FakeProvider(lambda task: GenerationResult(20, 'private/result.mp4'))
    runner = GenerationWorker(scheduler, provider, lambda task: True, lease_seconds=30, heartbeat_interval=1)
    assert runner.run_once(project).status == 'idle'
    assert provider.tasks == []
    assert scheduler.progress(owner, project) == {'uncertain': 1}
    scheduler.reconcile(job, 'not_submitted')
    assert runner.run_once(project).status == 'completed'
    assert len(provider.tasks) == 1
