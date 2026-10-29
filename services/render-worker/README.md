# CineMesh render worker

A deliberately small, local FFmpeg assembly tool. It concatenates compatible input clips listed in a JSON manifest and writes an MP4. It does not queue jobs, normalize incompatible streams, mix audio, render subtitles or produce HLS. Inputs and outputs must be under a single approved working directory.

```sh
python render.py /path/to/workspace manifest.json output.mp4
```

The manifest is `{ "clips": ["clip1.mp4", "clip2.mp4"] }`; all paths are relative to the workspace. Requires `ffmpeg` in PATH. Use only footage you are authorized to process.
