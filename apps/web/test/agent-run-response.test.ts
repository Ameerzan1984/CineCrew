import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAgentRunResponse } from "../lib/agent-run-response.ts";

test("saved agent runs keep the Film Bible but redact engine-local media paths", () => {
  const run = {
    status: "completed",
    output: {
      asset_library: {
        characters: [{
          id: "char_keeper", name: "The Keeper", description: "A tired lighthouse keeper.",
          visual_references: { canonical_image_path: "/srv/engine/private/keeper.png", generation_prompt: "Soft blue light" , variations: ["/srv/engine/keeper-side.png"] },
          audio_references: { voice_sample_path: "/srv/engine/private/keeper.wav", voice_model_id: "voice_1" },
        }],
        output_dir: "/srv/engine/private/run-1",
      },
      screenplay: { title: "The Blue Lantern" },
    },
  };
  const safe = sanitizeAgentRunResponse(run) as typeof run;
  assert.equal(safe.output.asset_library.characters[0].id, "char_keeper");
  assert.equal(safe.output.asset_library.characters[0].visual_references.canonical_image_path, undefined);
  assert.equal(safe.output.asset_library.characters[0].visual_references.variations, undefined);
  assert.equal(safe.output.asset_library.characters[0].audio_references.voice_sample_path, undefined);
  assert.equal(safe.output.asset_library.characters[0].audio_references.voice_model_id, "voice_1");
  assert.equal(safe.output.asset_library.output_dir, undefined);
  assert.equal(safe.output.screenplay.title, "The Blue Lantern");
});
