# CineMesh / CineCrew integration
# Copyright 2026 CineMesh contributors. Licensed under Apache-2.0.
"""Assemble compatible clips with FFmpeg within a caller-selected workspace."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def confined(root: Path, name: str) -> Path:
    path = (root / name).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Path must remain inside the workspace")
    return path


def render(root: Path, manifest_name: str, output_name: str) -> None:
    root = root.resolve(strict=True)
    manifest = json.loads(confined(root, manifest_name).read_text(encoding="utf-8"))
    clips = manifest.get("clips")
    if not isinstance(clips, list) or not clips or not all(isinstance(c, str) for c in clips):
        raise ValueError("Manifest must contain a non-empty list of clip paths")
    paths = [confined(root, c) for c in clips]
    if any(not p.is_file() for p in paths):
        raise ValueError("Every clip must exist")
    output = confined(root, output_name)
    if output in paths:
        raise ValueError("Output cannot overwrite an input")
    # FFmpeg concat demuxer requires its own escaping; reject unsafe characters.
    if any("'" in str(p) or "\n" in str(p) or "\r" in str(p) for p in paths):
        raise ValueError("Clip paths cannot contain apostrophes or newlines")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", encoding="utf-8", delete=False) as listing:
        listing_path = Path(listing.name)
        for path in paths:
            listing.write(f"file '{path.as_posix()}'\n")
    try:
        subprocess.run(["ffmpeg", "-nostdin", "-n", "-f", "concat", "-safe", "0", "-i", str(listing_path), "-c", "copy", "-movflags", "+faststart", str(output)], check=True)
    finally:
        listing_path.unlink(missing_ok=True)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: render.py WORKSPACE MANIFEST OUTPUT")
    render(Path(sys.argv[1]), sys.argv[2], sys.argv[3])
