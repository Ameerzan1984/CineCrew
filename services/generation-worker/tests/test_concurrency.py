# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from concurrent.futures import ThreadPoolExecutor
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_scheduler import pg_scheduler


def test_concurrent_workers_cannot_overbook_resource_or_budget(pg_scheduler):
    s, actor, project = pg_scheduler
    resource = s.register_resource(actor, 'test-provider', ['video'], 'USD', max_concurrency=1)
    s.grant(actor, project, resource, 100)
    for i in range(8):
        s.enqueue(actor, project, str(i), str(i), 'video', 'USD', 60)
    with ThreadPoolExecutor(max_workers=8) as workers:
        claims = list(workers.map(lambda _: s.claim(project), range(8)))
    assert sum(claim is not None for claim in claims) == 1
    assert s.progress(actor, project) == {'running': 1, 'queued': 7}


def test_concurrency_limit_spans_projects(pg_scheduler):
    from uuid import uuid4
    s, actor, first_project = pg_scheduler
    second_project = str(uuid4())
    s.authorize = lambda actor, project, action: None
    resource = s.register_resource(actor, 'test-provider', ['video'], 'USD', max_concurrency=1)
    s.grant(actor, first_project, resource, 100)
    s.grant(actor, second_project, resource, 100)
    s.enqueue(actor, first_project, '1', 'first', 'video', 'USD', 60)
    s.enqueue(actor, second_project, '2', 'second', 'video', 'USD', 60)
    with ThreadPoolExecutor(max_workers=2) as workers:
        claims = list(workers.map(s.claim, [first_project, second_project]))
    assert sum(claim is not None for claim in claims) == 1
