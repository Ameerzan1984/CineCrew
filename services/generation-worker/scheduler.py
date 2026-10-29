# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Transactional scheduler primitives. Only invoke from a trusted, authenticated service."""
from uuid import uuid4


def _id():
    return str(uuid4())


def choose_grant(grants, estimate):
    """Least utilized eligible grant first; deterministic tie-breaking.

    Rows must already be locked by the caller. Utilization includes reservations,
    so workers cannot over-allocate a contributor's budget.
    """
    eligible = [g for g in grants if g['spent_micros'] + g['reserved_micros'] + estimate <= g['budget_micros']]
    if not eligible:
        return None
    # Integer cross multiplication avoids float errors for large budgets.
    from functools import cmp_to_key
    def compare(a, b):
        left = (a['spent_micros'] + a['reserved_micros']) * b['budget_micros']
        right = (b['spent_micros'] + b['reserved_micros']) * a['budget_micros']
        if left != right:
            return -1 if left < right else 1
        return (str(a['id']) > str(b['id'])) - (str(a['id']) < str(b['id']))
    return sorted(eligible, key=cmp_to_key(compare))[0]


class Scheduler:
    """All project access checks are supplied by the hosting service, not the caller's browser.

    connect must return a new psycopg connection using dict_row. authorize must
    raise on denied project access. Resource owner checks are enforced here.
    """
    def __init__(self, connect, authorize):
        self.connect = connect
        self.authorize = authorize

    def register_resource(self, actor, provider, capabilities, currency, max_concurrency=1):
        if not provider or not capabilities or any(not c for c in capabilities) or max_concurrency < 1:
            raise ValueError('invalid resource')
        rid = _id()
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('INSERT INTO generation_resources (id, owner_id, provider, capabilities, currency, max_concurrency) VALUES (%s,%s,%s,%s,%s,%s)', (rid, actor, provider, capabilities, currency, max_concurrency))
        return rid

    def grant(self, actor, project, resource, budget_micros):
        self.authorize(actor, project, 'contribute')
        if budget_micros <= 0:
            raise ValueError('budget must be positive')
        gid = _id()
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT id FROM generation_resources WHERE id=%s AND owner_id=%s AND enabled FOR UPDATE', (resource, actor))
            if not cur.fetchone():
                raise PermissionError('resource unavailable')
            cur.execute('INSERT INTO generation_grants (id,project_id,resource_id,owner_id,budget_micros) VALUES (%s,%s,%s,%s,%s)', (gid, project, resource, actor, budget_micros))
        return gid

    def revoke(self, actor, grant):
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('UPDATE generation_grants SET active=false WHERE id=%s AND owner_id=%s RETURNING id', (grant, actor))
            if not cur.fetchone():
                raise PermissionError('grant unavailable')

    def enqueue(self, actor, project, shot, request_key, capability, currency, estimate, max_attempts=3):
        self.authorize(actor, project, 'produce')
        if not all((shot, request_key, capability)) or estimate <= 0 or not 1 <= max_attempts <= 10:
            raise ValueError('invalid job')
        jid, provider_key = _id(), _id()
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('''INSERT INTO generation_jobs (id,project_id,shot_id,request_key,capability,currency,estimated_micros,max_attempts,provider_request_key)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (project_id,request_key) DO NOTHING RETURNING id''',
                (jid, project, shot, request_key, capability, currency, estimate, max_attempts, provider_key))
            row = cur.fetchone()
            if not row:
                cur.execute('SELECT * FROM generation_jobs WHERE project_id=%s AND request_key=%s', (project, request_key))
                existing = cur.fetchone()
                if (existing['shot_id'], existing['capability'], existing['currency'], existing['estimated_micros'], existing['max_attempts']) != (shot, capability, currency, estimate, max_attempts):
                    raise ValueError('idempotency key already used with different job')
                return str(existing['id'])
            return str(row['id'])

    def claim(self, project, lease_seconds=300):
        """Trusted worker only. Returns an opaque resource ID, never credentials."""
        if not 1 <= lease_seconds <= 3600:
            raise ValueError('invalid lease')
        with self.connect() as conn, conn.cursor() as cur:
            # Serialize claims per project, including when no matching row exists.
            cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (str(project),))
            cur.execute("SELECT * FROM generation_jobs WHERE project_id=%s AND status='queued' AND available_at <= now() ORDER BY created_at,id FOR UPDATE", (project,))
            jobs = cur.fetchall()
            for job in jobs:
                # Lock resource rows across projects to enforce global concurrency.
                cur.execute('''SELECT g.*, r.max_concurrency FROM generation_grants g
                    JOIN generation_resources r ON r.id=g.resource_id
                    WHERE g.project_id=%s AND g.active AND r.enabled AND r.currency=%s AND %s=ANY(r.capabilities)
                    ORDER BY r.id FOR UPDATE OF g,r''', (project, job['currency'], job['capability']))
                candidates = []
                for grant in cur.fetchall():
                    cur.execute("SELECT count(*) AS n FROM generation_jobs j JOIN generation_grants g ON g.id=j.grant_id WHERE g.resource_id=%s AND j.status IN ('running','uncertain')", (grant['resource_id'],))
                    if cur.fetchone()['n'] < grant['max_concurrency']:
                        candidates.append(grant)
                chosen = choose_grant(candidates, job['estimated_micros'])
                if chosen is None:
                    continue
                token = _id()
                cur.execute('UPDATE generation_grants SET reserved_micros=reserved_micros+%s WHERE id=%s', (job['estimated_micros'], chosen['id']))
                cur.execute("""UPDATE generation_jobs SET status='running',grant_id=%s,lease_token=%s,
                    lease_until=now()+(%s * interval '1 second'),attempts=attempts+1,updated_at=now() WHERE id=%s""", (chosen['id'], token, lease_seconds, job['id']))
                return {'job_id': str(job['id']), 'project_id': str(project), 'shot_id': job['shot_id'], 'resource_id': str(chosen['resource_id']), 'resource_owner_id': str(chosen['owner_id']), 'provider_request_key': str(job['provider_request_key']), 'lease_token': token, 'capability': job['capability']}
        return None

    def finish(self, job_id, token, actual_micros, result_ref):
        """Record actual provider charges, including an unexpected overrun."""
        if actual_micros < 0 or not result_ref:
            raise ValueError('invalid result')
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT * FROM generation_jobs WHERE id=%s FOR UPDATE', (job_id,))
            job = cur.fetchone()
            if not job or job['status'] != 'running' or str(job['lease_token']) != str(token):
                raise ValueError('stale lease')
            cur.execute('UPDATE generation_grants SET reserved_micros=reserved_micros-%s,spent_micros=spent_micros+%s WHERE id=%s', (job['estimated_micros'], actual_micros, job['grant_id']))
            cur.execute('INSERT INTO generation_ledger (id,job_id,grant_id,actual_micros,currency) VALUES (%s,%s,%s,%s,%s)', (_id(), job_id, job['grant_id'], actual_micros, job['currency']))
            cur.execute("UPDATE generation_jobs SET status='completed',result_ref=%s,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=%s", (result_ref, job_id))

    def fail(self, job_id, token, definitive):
        """Retry only definitive failures; uncertain outcomes keep funds reserved."""
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT * FROM generation_jobs WHERE id=%s FOR UPDATE', (job_id,))
            job = cur.fetchone()
            if not job or job['status'] != 'running' or str(job['lease_token']) != str(token):
                raise ValueError('stale lease')
            if not definitive:
                cur.execute("UPDATE generation_jobs SET status='uncertain',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=%s", (job_id,))
                return
            cur.execute('UPDATE generation_grants SET reserved_micros=reserved_micros-%s WHERE id=%s', (job['estimated_micros'], job['grant_id']))
            status = 'failed' if job['attempts'] >= job['max_attempts'] else 'queued'
            delay = min(3600, 2 ** job['attempts'] * 5)
            cur.execute("UPDATE generation_jobs SET status=%s,grant_id=NULL,lease_token=NULL,lease_until=NULL,available_at=now()+(%s * interval '1 second'),updated_at=now() WHERE id=%s", (status, delay, job_id))

    def expire_leases(self):
        """Uncertain means reconcile at provider; do not submit a duplicate."""
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE generation_jobs SET status='uncertain',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status='running' AND lease_until < now() RETURNING id")
            return [str(row['id']) for row in cur.fetchall()]

    def reconcile(self, job_id, outcome, actual_micros=0, result_ref=None):
        """Trusted operator reconciles an uncertain provider request against provider records.

        'completed' requires the real result and cost. 'charged_failed' records
        a provider failure that nevertheless incurred a charge. 'not_submitted'
        requires proof that the provider neither accepted nor charged it.
        """
        if outcome not in ('completed', 'charged_failed', 'not_submitted') or actual_micros < 0:
            raise ValueError('invalid outcome')
        if outcome == 'completed' and not result_ref:
            raise ValueError('result is required')
        if outcome == 'not_submitted' and actual_micros != 0:
            raise ValueError('not_submitted cannot have a charge')
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT * FROM generation_jobs WHERE id=%s FOR UPDATE', (job_id,))
            job = cur.fetchone()
            if not job or job['status'] != 'uncertain':
                raise ValueError('job is not uncertain')
            cur.execute('UPDATE generation_grants SET reserved_micros=reserved_micros-%s,spent_micros=spent_micros+%s WHERE id=%s', (job['estimated_micros'], actual_micros, job['grant_id']))
            if outcome in ('completed', 'charged_failed'):
                cur.execute('INSERT INTO generation_ledger (id,job_id,grant_id,actual_micros,currency) VALUES (%s,%s,%s,%s,%s)', (_id(), job_id, job['grant_id'], actual_micros, job['currency']))
                status = 'completed' if outcome == 'completed' else 'failed'
                cur.execute("UPDATE generation_jobs SET status=%s,result_ref=%s,updated_at=now() WHERE id=%s", (status, result_ref, job_id))
            else:
                status = 'failed' if job['attempts'] >= job['max_attempts'] else 'queued'
                cur.execute('UPDATE generation_jobs SET status=%s,grant_id=NULL,available_at=now(),updated_at=now() WHERE id=%s', (status, job_id))

    def progress(self, actor, project):
        self.authorize(actor, project, 'view')
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT status,count(*) AS count FROM generation_jobs WHERE project_id=%s GROUP BY status', (project,))
            return {row['status']: row['count'] for row in cur.fetchall()}
