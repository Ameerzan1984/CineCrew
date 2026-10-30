import { ProviderStateError } from "./index.ts";

/** Verified from Higgsfield's Seedance 2.5 text-to-video API reference. */
export const HIGGSFIELD_SEEDANCE_25_MODEL = "/bytedance/seedance-2.5/text-to-video";

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
