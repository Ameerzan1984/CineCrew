# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
import os
import sys
from pathlib import Path
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scheduler import Scheduler, choose_grant


def grant(id, budget, spent=0, reserved=0):
    return dict(id=id, budget_micros=budget, spent_micros=spent, reserved_micros=reserved)


def test_selects_lowest_relative_use_and_counts_reservations():
    resources = [grant('a', 100, 20, 40), grant('b', 200, 80, 0)]
    assert choose_grant(resources, 10)['id'] == 'b'
    resources[1]['reserved_micros'] = 60
    assert choose_grant(resources, 10)['id'] == 'a'


def test_excludes_over_budget_and_handles_large_integer_precision():
    limit = 10**18
    a = grant('a', limit, limit - 1)
    b = grant('b', limit, limit - 2)
    assert choose_grant([a, b], 1)['id'] == 'b'
    assert choose_grant([a, b], 3) is None


def test_ties_are_deterministic():
    assert choose_grant([grant('b', 100), grant('a', 200)], 20)['id'] == 'a'


@pytest.fixture
def pg_scheduler():
    dsn = os.environ.get('CINEMESH_TEST_POSTGRES_URL')
    if not dsn:
        pytest.skip('CINEMESH_TEST_POSTGRES_URL is not configured')
    import psycopg
    from psycopg import sql
    from psycopg.rows import dict_row
    schema = 'test_generation_' + uuid4().hex
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
        conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
        conn.execute((Path(__file__).resolve().parents[1] / 'migrations/001_scheduler.sql').read_text(encoding='utf-8'))
    def connect():
        conn = psycopg.connect(dsn, row_factory=dict_row)
        conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
        return conn
    def authorize(actor, project, action):
        if str(actor) != authorized_actor or str(project) != authorized_project:
            raise PermissionError('denied')
    authorized_actor, authorized_project = str(uuid4()), str(uuid4())
    yield Scheduler(connect, authorize), authorized_actor, authorized_project
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


def test_real_database_budget_revocation_retry_and_ledger(pg_scheduler):
    s, actor, project = pg_scheduler
    resource = s.register_resource(actor, 'test-provider', ['video'], 'USD')
    allocation = s.grant(actor, project, resource, 100)
    with pytest.raises(PermissionError):
        s.revoke(str(uuid4()), allocation)
    job = s.enqueue(actor, project, 'shot-1', 'request-1', 'video', 'USD', 60)
    assert s.enqueue(actor, project, 'shot-1', 'request-1', 'video', 'USD', 60) == job
    with pytest.raises(ValueError):
        s.enqueue(actor, project, 'shot-2', 'request-1', 'video', 'USD', 60)
    first = s.claim(project)
    assert first['job_id'] == job
    s.fail(job, first['lease_token'], definitive=False)
    assert s.progress(actor, project) == {'uncertain': 1}
    assert s.claim(project) is None
    s.reconcile(job, 'not_submitted')
    second = s.claim(project)
    assert second['provider_request_key'] == first['provider_request_key']
    s.finish(job, second['lease_token'], 70, 'private/object')
    assert s.progress(actor, project) == {'completed': 1}
    s.enqueue(actor, project, 'shot-2', 'request-2', 'video', 'USD', 40)
    assert s.claim(project) is None
    s.revoke(actor, allocation)
    with pytest.raises(PermissionError):
        s.progress(str(uuid4()), project)


def test_records_unexpected_actual_cost_and_blocks_subsequent_work(pg_scheduler):
    s, actor, project = pg_scheduler
    resource = s.register_resource(actor, 'test-provider', ['video'], 'USD')
    s.grant(actor, project, resource, 100)
    job = s.enqueue(actor, project, 'shot-1', 'request-1', 'video', 'USD', 60)
    claim = s.claim(project)
    s.finish(job, claim['lease_token'], 120, 'private/object')
    s.enqueue(actor, project, 'shot-2', 'request-2', 'video', 'USD', 1)
    assert s.claim(project) is None
    with s.connect() as conn, conn.cursor() as cur:
        cur.execute('SELECT actual_micros FROM generation_ledger WHERE job_id=%s', (job,))
        assert cur.fetchone()['actual_micros'] == 120


def test_expired_lease_cannot_be_used_after_sweep(pg_scheduler):
    s, actor, project = pg_scheduler
    resource = s.register_resource(actor, 'test-provider', ['video'], 'USD')
    s.grant(actor, project, resource, 100)
    job = s.enqueue(actor, project, 'shot-1', 'request-1', 'video', 'USD', 60)
    claim = s.claim(project)
    with s.connect() as conn, conn.cursor() as cur:
        cur.execute("UPDATE generation_jobs SET lease_until=now()-interval '1 second' WHERE id=%s", (job,))
    assert s.expire_leases() == [job]
    with pytest.raises(ValueError):
        s.finish(job, claim['lease_token'], 10, 'private/object')
    assert s.progress(actor, project) == {'uncertain': 1}
