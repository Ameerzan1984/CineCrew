import { strict as assert } from "node:assert";
import { test } from "node:test";
import { HIGGSFIELD_SEEDANCE_25_MODEL, HIGGSFIELD_SEEDANCE_25_REFERENCE_MODEL, ProviderStateError, seedance25Input, seedance25ReferenceInput } from "../src/index.ts";

test("builds the documented Seedance 2.5 text-to-video payload", () => {
  assert.equal(HIGGSFIELD_SEEDANCE_25_MODEL, "/bytedance/seedance-2.5/text-to-video");
  assert.deepEqual(seedance25Input("A quiet street at dawn"), {
    prompt: "A quiet street at dawn", duration: 4, resolution: "720p", aspect_ratio: "16:9",
    output_format: "mp4", generate_audio: true,
  });
});

test("rejects empty prompts and unsupported clip durations", () => {
  for (const [prompt, duration] of [["", 4], ["x".repeat(4001), 4], ["shot", 3], ["shot", 31], ["shot", 4.5]]) {
    assert.throws(() => seedance25Input(prompt, duration), ProviderStateError);
  }
});

test("builds a documented Seedance 2.5 reference-to-video continuation request", () => {
  const referenceUrl = "https://d3example.cloudfront.net/first-shot.mp4?signature=abc";
  assert.equal(HIGGSFIELD_SEEDANCE_25_REFERENCE_MODEL,"/bytedance/seedance-2.5/reference-to-video");
  assert.deepEqual(seedance25ReferenceInput("Continue the action",referenceUrl), {
    prompt: "Continue the action", duration: 4, resolution: "720p", aspect_ratio: "16:9",
    output_format: "mp4", generate_audio: true, video_urls: [referenceUrl],
  });
  assert.throws(() => seedance25ReferenceInput("Continue", "http://example.com/clip.mp4"),ProviderStateError);
});
