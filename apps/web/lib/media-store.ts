import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_STORED_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mediaRoot(): string {
  return path.resolve(process.env.CINEMESH_MEDIA_DIR || path.join(process.cwd(), ".data", "media"));
}

export function safeMediaPath(root: string, key: string): string {
  if (typeof key !== "string" || key.length > 240 || key.includes("\\") || key.startsWith("/")) {
    throw new Error("Invalid media key");
  }
  const parts = key.split("/");
  if (!parts.length || parts.some(part => !part || part === "." || part === ".." || !/^[a-zA-Z0-9._-]+$/.test(part))) {
    throw new Error("Invalid media key");
  }
  const base = path.resolve(root);
  const target = path.resolve(base, ...parts);
  if (target === base || !target.startsWith(`${base}${path.sep}`)) throw new Error("Media path escaped storage root");
  return target;
}

export function isTrustedHiggsfieldOutput(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") &&
      (url.hostname.endsWith(".cloudfront.net") || url.hostname === "higgsfield.ai" || url.hostname.endsWith(".higgsfield.ai"));
  } catch { return false; }
}

export async function persistProviderVideo(sourceUrl: string, filmId: string, jobId: string) {
  if (!UUID.test(filmId) || !UUID.test(jobId) || !isTrustedHiggsfieldOutput(sourceUrl)) {
    throw new Error("Higgsfield returned an unsupported video URL");
  }
  const root = mediaRoot();
  const id = randomUUID();
  const storageKey = `${filmId.toLowerCase()}/clips/${id}.mp4`;
  const target = safeMediaPath(root, storageKey);
  await mkdir(path.dirname(target), { recursive: true });

  let response: Response;
  try {
    response = await fetch(sourceUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(120_000) });
  } catch { throw new Error("Could not download the temporary Higgsfield video"); }
  if (!response.ok || !response.body) throw new Error(`Higgsfield video download returned HTTP ${response.status}`);
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType && contentType !== "video/mp4" && contentType !== "application/octet-stream") {
    throw new Error("Higgsfield returned a file that is not MP4 video");
  }
  const announced = Number(response.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > MAX_VIDEO_BYTES) throw new Error("Video exceeds the 512 MiB storage limit");

  const partial = `${target}.${randomUUID()}.part`;
  const hash = createHash("sha256");
  let size = 0;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    size += chunk.length;
    if (size > MAX_VIDEO_BYTES) return callback(new Error("Video exceeds the 512 MiB storage limit"));
    hash.update(chunk);
    callback(null, chunk);
  } });
  try {
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), meter, createWriteStream(partial, { flags: "wx" }));
    if (size < 12) throw new Error("Higgsfield returned an empty or invalid video file");
    await rename(partial, target);
    return { id, storageKey, path: target, mimeType: "video/mp4" as const, sizeBytes: size, sha256: hash.digest("hex") };
  } catch (error) {
    await rm(partial, { force: true });
    await rm(target, { force: true });
    throw error;
  }
}

export async function removeStoredFile(storageKey: string): Promise<void> {
  try { await rm(safeMediaPath(mediaRoot(), storageKey), { force: true }); } catch { /* Best effort cleanup. */ }
}

export async function mediaFileInfo(storageKey: string) {
  const file = safeMediaPath(mediaRoot(), storageKey);
  const info = await stat(file);
  if (!info.isFile() || info.size <= 0 || info.size > MAX_STORED_MEDIA_BYTES) throw new Error("Media file is unavailable");
  return { file, size: info.size };
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  const input = (await import("node:fs")).createReadStream(file);
  for await (const chunk of input) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
