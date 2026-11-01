import { test } from "node:test";
import { strict as assert } from "node:assert";
import { matchesAgentRunBinding } from "../lib/agent-run-binding.ts";

test("run resumption remains bound to the original film, owner, model and provider", () => {
  const row = { film_id: "abc", created_by: "owner", model: "model-a", provider: "openai_api" };
  assert.equal(matchesAgentRunBinding(row, "ABC", "owner", "model-a", "openai_api"), true);
  assert.equal(matchesAgentRunBinding(row, "other", "owner", "model-a", "openai_api"), false);
  assert.equal(matchesAgentRunBinding(row, "abc", "other", "model-a", "openai_api"), false);
  assert.equal(matchesAgentRunBinding(row, "abc", "owner", "model-b", "openai_api"), false);
  assert.equal(matchesAgentRunBinding(row, "abc", "owner", "model-a", "chatgpt_plan"), false);
});
