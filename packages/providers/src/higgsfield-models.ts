import { ProviderStateError } from "./index.ts";

/** Verified from Higgsfield's Seedance 2.5 text-to-video API reference. */
export const HIGGSFIELD_SEEDANCE_25_MODEL = "/bytedance/seedance-2.5/text-to-video";
export const HIGGSFIELD_SEEDANCE_25_REFERENCE_MODEL = "/bytedance/seedance-2.5/reference-to-video";

export function seedance25Input(prompt: unknown, duration: unknown = 4): Record<string, unknown> {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
    throw new ProviderStateError("A shot prompt between 1 and 4000 characters is required.");
  }
  if (!Number.isInteger(duration) || (duration as number) < 4 || (duration as number) > 30) {
    throw new ProviderStateError("Seedance 2.5 supports clip durations from 4 to 30 seconds.");
  }
  return {
    prompt: prompt.trim(),
    duration,
    resolution: "720p",
    aspect_ratio: "16:9",
    output_format: "mp4",
    generate_audio: true,
  };
}

/** Seedance 2.5 Reference-to-Video accepts video references and bills them to this contributor's API balance. */
export function seedance25ReferenceInput(prompt: unknown, referenceUrl: unknown, duration: unknown = 4): Record<string, unknown> {
  if (typeof referenceUrl !== "string") throw new ProviderStateError("A completed earlier shot is required for visual continuation.");
  let parsed: URL;
  try { parsed = new URL(referenceUrl); }
  catch { throw new ProviderStateError("The earlier shot URL is invalid."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      !(parsed.hostname.endsWith(".cloudfront.net") || parsed.hostname === "higgsfield.ai" || parsed.hostname.endsWith(".higgsfield.ai"))) {
    throw new ProviderStateError("The earlier shot must be a trusted Higgsfield video URL.");
  }
  return {
    ...seedance25Input(prompt,duration),
    video_urls: [parsed.toString()],
  };
}
