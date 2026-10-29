# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
from uuid import uuid4
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import api
from test_scheduler import pg_scheduler


def test_service_token_and_project_membership_are_both_required(pg_scheduler, monkeypatch):
    s, owner, project = pg_scheduler
    outsider, editor, viewer = str(uuid4()), str(uuid4()), str(uuid4())
    with s.connect() as conn, conn.cursor() as cur:
        cur.execute('CREATE TABLE users (id uuid PRIMARY KEY)')
        cur.execute('CREATE TABLE films (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id))')
        cur.execute('CREATE TABLE film_contributors (film_id uuid NOT NULL REFERENCES films(id), user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL, PRIMARY KEY(film_id,user_id))')
        for user in (owner, outsider, editor, viewer):
            cur.execute('INSERT INTO users (id) VALUES (%s)', (user,))
        cur.execute('INSERT INTO films (id,owner_id) VALUES (%s,%s)', (project,owner))
        cur.execute('INSERT INTO film_contributors (film_id,user_id,role) VALUES (%s,%s,%s),(%s,%s,%s)', (project,editor,'editor',project,viewer,'viewer'))
    monkeypatch.setattr(api, 'connect_db', s.connect)
    monkeypatch.setenv('GENERATION_SERVICE_TOKEN', 'integration-test-token')
    client = TestClient(api.app)
    def headers(actor):
        return {'X-Cinemesh-Service-Token':'integration-test-token', 'X-Cinemesh-Actor':actor}
    assert client.get(f'/projects/{project}/progress', headers={'X-Cinemesh-Actor':owner}).status_code == 401
    assert client.get(f'/projects/{project}/progress', headers=headers(outsider)).status_code == 403
    assert client.get(f'/projects/{project}/progress', headers=headers(viewer)).status_code == 200
    payload = {'shot_id':'shot-1','request_key':'key','capability':'video','currency':'USD','estimated_micros':50}
    assert client.post(f'/projects/{project}/jobs', headers=headers(viewer), json=payload).status_code == 403
    assert client.post(f'/projects/{project}/jobs', headers=headers(editor), json=payload).status_code == 201
    resource = client.post('/resources', headers=headers(editor), json={'provider':'x','capabilities':['video'],'currency':'USD'}).json()['id']
    assert client.post(f'/projects/{project}/grants', headers=headers(outsider), json={'resource_id':resource,'budget_micros':100}).status_code == 403
    assert client.post(f'/projects/{project}/grants', headers=headers(owner), json={'resource_id':resource,'budget_micros':100}).status_code == 403
    grant = client.post(f'/projects/{project}/grants', headers=headers(editor), json={'resource_id':resource,'budget_micros':100}).json()['id']
    assert client.delete(f'/grants/{grant}', headers=headers(owner)).status_code == 403
    assert client.delete(f'/grants/{grant}', headers=headers(editor)).status_code == 204


def test_service_is_closed_when_token_is_unconfigured(monkeypatch):
    monkeypatch.delenv('GENERATION_SERVICE_TOKEN', raising=False)
    assert TestClient(api.app).get('/projects/a/progress').status_code == 503
