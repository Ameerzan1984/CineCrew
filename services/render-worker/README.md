# CineMesh render worker

A deliberately small, local FFmpeg assembly tool. It concatenates compatible input clips listed in a JSON manifest and writes an MP4. It does not queue jobs, normalize incompatible streams, mix audio, render subtitles or produce HLS. Inputs and outputs must be under a single approved working directory.

```sh
python render.py /path/to/workspace manifest.json output.mp4
```

The manifest is `{ "clips": ["clip1.mp4", "clip2.mp4"] }`; all paths are relative to the workspace. Requires `ffmpeg` in PATH. Use only footage you are authorized to process. The web app stores uploaded provider clips on its configured media volume and runs this worker for short assemblies (up to 100 clips / 2 GiB of input / 180 seconds). This local synchronous slice is not the background render queue required for feature-length films.
