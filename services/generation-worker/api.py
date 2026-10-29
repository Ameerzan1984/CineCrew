# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Internal HTTP adapter; only a trusted gateway may hold its service token."""
import hmac
import os
from typing import Annotated
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from scheduler import Scheduler

app = FastAPI(title='CineMesh internal generation scheduler', docs_url=None, redoc_url=None, openapi_url=None)


def connect_db():
    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        raise HTTPException(503, 'Scheduler database is not configured')
    return psycopg.connect(dsn, row_factory=dict_row)


def authorize(actor, project, action):
    # Gateway authenticates actor; check the authoritative DB independently.
    with connect_db() as conn, conn.cursor() as cur:
        cur.execute('''SELECT f.owner_id, c.role FROM films f LEFT JOIN film_contributors c
            ON c.film_id=f.id AND c.user_id=%s WHERE f.id=%s''', (actor, project))
        row = cur.fetchone()
    if not row:
        raise PermissionError('project unavailable')
    owner = str(row['owner_id']) == str(actor)
    if not owner and (row['role'] is None or (action != 'view' and row['role'] != 'editor')):
        raise PermissionError('project unavailable')


def scheduler():
    return Scheduler(connect_db, authorize)


@app.middleware('http')
async def require_service_token(request: Request, call_next):
    token = os.environ.get('GENERATION_SERVICE_TOKEN', '')
    if not token:
        return JSONResponse({'detail': 'Scheduler service token is not configured'}, status_code=503)
    supplied = request.headers.get('X-Cinemesh-Service-Token', '')
    if not hmac.compare_digest(supplied.encode(), token.encode()):
        return JSONResponse({'detail': 'Unauthorized'}, status_code=401)
    return await call_next(request)


@app.exception_handler(PermissionError)
async def permission_error(_request, _error):
    return JSONResponse({'detail': 'Resource unavailable'}, status_code=403)


@app.exception_handler(ValueError)
async def value_error(_request, _error):
    return JSONResponse({'detail': 'Invalid request or conflicting idempotency key'}, status_code=400)


class ResourceCreate(BaseModel):
    provider: str = Field(min_length=1, max_length=80)
    capabilities: list[str] = Field(min_length=1, max_length=50)
    currency: str = Field(pattern='^[A-Z]{3}$')
    max_concurrency: int = Field(default=1, ge=1, le=100)


class GrantCreate(BaseModel):
    resource_id: UUID
    budget_micros: int = Field(gt=0, le=10**15)


class JobCreate(BaseModel):
    shot_id: str = Field(min_length=1, max_length=200)
    request_key: str = Field(min_length=1, max_length=200)
    capability: str = Field(min_length=1, max_length=100)
    currency: str = Field(pattern='^[A-Z]{3}$')
    estimated_micros: int = Field(gt=0, le=10**15)
    max_attempts: int = Field(default=3, ge=1, le=10)


Actor = Annotated[UUID, Header(alias='X-Cinemesh-Actor')]


def existing_actor(actor):
    with connect_db() as conn, conn.cursor() as cur:
        cur.execute('SELECT id FROM users WHERE id=%s', (actor,))
        if not cur.fetchone():
            raise PermissionError('actor unavailable')


@app.post('/resources', status_code=201)
def create_resource(body: ResourceCreate, actor: Actor):
    existing_actor(actor)
    rid = scheduler().register_resource(str(actor), body.provider, body.capabilities, body.currency, body.max_concurrency)
    return {'id': rid}


@app.post('/projects/{project}/grants', status_code=201)
def create_grant(project: UUID, body: GrantCreate, actor: Actor):
    gid = scheduler().grant(str(actor), str(project), str(body.resource_id), body.budget_micros)
    return {'id': gid}


@app.delete('/grants/{grant}', status_code=204)
def revoke_grant(grant: UUID, actor: Actor):
    scheduler().revoke(str(actor), str(grant))


@app.post('/projects/{project}/jobs', status_code=201)
def enqueue(project: UUID, body: JobCreate, actor: Actor):
    jid = scheduler().enqueue(str(actor), str(project), body.shot_id, body.request_key, body.capability, body.currency, body.estimated_micros, body.max_attempts)
    return {'id': jid}


@app.get('/projects/{project}/progress')
def progress(project: UUID, actor: Actor):
    return scheduler().progress(str(actor), str(project))
