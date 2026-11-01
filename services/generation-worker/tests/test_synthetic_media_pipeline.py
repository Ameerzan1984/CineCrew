# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""PostgreSQL worker and FFmpeg integration using only synthetic media."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_scheduler import pg_scheduler
from worker import GenerationResult, GenerationWorker


def test_two_synthetic_contributors_generate_and_assemble_private_clips(pg_scheduler, tmp_path):
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        pytest.skip('ffmpeg and ffprobe are required for the synthetic media integration')
    scheduler, owner, project = pg_scheduler
    other = str(uuid4())

    def authorize(actor, target, _action):
        if actor not in (owner, other) or target != project:
            raise PermissionError('denied')

    scheduler.authorize = authorize
    for actor in (owner, other):
        resource = scheduler.register_resource(actor, 'synthetic-provider', ['video'], 'USD')
        scheduler.grant(actor, project, resource, 100)
    for index in range(2):
        scheduler.enqueue(owner, project, f'shot-{index}', f'synthetic-{index}', 'video', 'USD', 10)

    class SyntheticProvider:
        def __init__(self):
            self.tasks = []
            self.refs = []

        def execute(self, task):
            self.tasks.append(task)
            assert not hasattr(task, 'lease_token')
            key = f'clips/{task.job_id}.mp4'
            clip = tmp_path / key
            clip.parent.mkdir(parents=True, exist_ok=True)
            color = 'red' if len(self.tasks) == 1 else 'blue'
            subprocess.run([
                'ffmpeg', '-nostdin', '-v', 'error', '-n', '-f', 'lavfi',
                '-i', f'color=c={color}:s=160x90:r=24:d=1',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', str(clip),
            ], check=True, timeout=30)
            self.refs.append(key)
            # This amount is a synthetic ledger value; no provider is contacted.
            return GenerationResult(actual_micros=10, result_ref=key)

    provider = SyntheticProvider()
    worker = GenerationWorker(scheduler, provider, lambda task: task.resource_owner_id in (owner, other),
                              lease_seconds=30, heartbeat_interval=1)
    assert worker.run_once(project).status == 'completed'
    assert worker.run_once(project).status == 'completed'
    assert {task.resource_owner_id for task in provider.tasks} == {owner, other}
    assert scheduler.progress(owner, project) == {'completed': 2}

    manifest = tmp_path / 'manifest.json'
    manifest.write_text(json.dumps({'clips': provider.refs}), encoding='utf-8')
    render_path = Path(__file__).resolve().parents[2] / 'render-worker' / 'render.py'
    spec = importlib.util.spec_from_file_location('cinemesh_test_render', render_path)
    assert spec and spec.loader
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    renderer.render(tmp_path, manifest.name, 'assembled.mp4')
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                            '-of', 'json', str(tmp_path / 'assembled.mp4')],
                           check=True, capture_output=True, text=True, timeout=30)
    assert float(json.loads(probe.stdout)['format']['duration']) >= 1.9
