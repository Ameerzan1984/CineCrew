# CineMesh / CineCrew integration
# Copyright 2026 CineMesh contributors. Licensed under Apache-2.0.
"""Short local assembly test using generated color bars, never provider footage."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from render import render


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg tools are not installed")
def test_assembles_two_short_compatible_mp4_clips(tmp_path: Path) -> None:
    for name, color in (("first.mp4", "red"), ("second.mp4", "blue")):
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
             f"color=c={color}:s=160x90:d=0.5:r=24", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", str(tmp_path / name)], check=True,
        )

    (tmp_path / "manifest.json").write_text(json.dumps({"clips": ["first.mp4", "second.mp4"]}), encoding="utf-8")
    render(tmp_path, "manifest.json", "assembled.mp4")
    duration = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(tmp_path / "assembled.mp4")],
        check=True, capture_output=True, text=True,
    )
    seconds = float(json.loads(duration.stdout)["format"]["duration"])
    assert 0.9 <= seconds <= 1.2
