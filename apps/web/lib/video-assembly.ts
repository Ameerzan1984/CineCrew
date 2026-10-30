import { spawn } from "node:child_process";
import { copyFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mediaRoot, safeMediaPath, sha256File } from "./media-store";

const MAX_CLIPS_PER_RENDER = 100;
const MAX_RENDER_INPUT_BYTES = 2 * 1024 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RenderInput = { storageKey: string; sizeBytes: number };

function runRenderer(workspace: string, manifest: string, output: string): Promise<void> {
  const python = process.env.CINEMESH_RENDER_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const script = path.resolve(process.cwd(), "../../services/render-worker/render.py");
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, workspace, manifest, output], { cwd: workspace, shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => { if (stderr.length < 8192) stderr += chunk; });
    child.once("error", () => finish(new Error("Render worker could not start")));
    child.once("exit", code => code === 0 ? finish() : finish(new Error(stderr.includes("ffmpeg") ? "FFmpeg could not assemble these clips" : "Render worker failed")));
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(new Error("Short-film assembly exceeded its 180-second limit")); }, 180_000);
  });
}

/** Local, bounded render slice. Long feature renders should move to a persistent worker queue. */
export async function assembleVideoAssets(filmId: string, renderId: string, clips: RenderInput[]) {
  if (!UUID.test(filmId) || !UUID.test(renderId) || clips.length < 2 || clips.length > MAX_CLIPS_PER_RENDER ||
      clips.some(clip => !Number.isSafeInteger(clip.sizeBytes) || clip.sizeBytes <= 0) ||
      clips.reduce((sum, clip) => sum + clip.sizeBytes, 0) > MAX_RENDER_INPUT_BYTES) {
    throw new Error("This render exceeds the supported short-film limits");
  }
  const root = mediaRoot();
  const workspace = safeMediaPath(root, `.work/${renderId}`);
  const output = safeMediaPath(root, `${filmId.toLowerCase()}/renders/${renderId}.mp4`);
  await mkdir(workspace, { recursive: true });
  await mkdir(path.dirname(output), { recursive: true });
  const manifestName = "manifest.json";
  const outputName = "assembled.mp4";
  try {
    const localClips: string[] = [];
    for (const [index, clip] of clips.entries()) {
      const source = safeMediaPath(root, clip.storageKey);
      const fileName = `clip-${String(index + 1).padStart(3, "0")}.mp4`;
      await copyFile(source, path.join(workspace, fileName));
      localClips.push(fileName);
    }
    await writeFile(path.join(workspace, manifestName), JSON.stringify({ clips: localClips }), { encoding: "utf8", flag: "wx" });
    await runRenderer(workspace, manifestName, outputName);
    const assembled = path.join(workspace, outputName);
    const result = await stat(assembled);
    if (!result.isFile() || result.size <= 0 || result.size > MAX_RENDER_INPUT_BYTES) throw new Error("Rendered video has an invalid size");
    await rename(assembled, output);
    return { storageKey: `${filmId.toLowerCase()}/renders/${renderId}.mp4`, sizeBytes: result.size, sha256: await sha256File(output) };
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
