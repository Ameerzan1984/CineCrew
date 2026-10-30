import { strict as assert } from "node:assert";
import { test } from "node:test";
import { agentShotsFromRun } from "../lib/agent-shots.ts";

const run = { status: "completed", output: { blueprint: { shots: [
  { shot_id: "shot_1", narrative_layer: { narrative_action: "A traveler opens the door.", emotional_beat: "uncertainty", dialogue: { has_dialogue: false, text: "ignored" } } },
  { shot_id: "shot_2", narrative_layer: { narrative_action: "The traveler enters.", dialogue: { has_dialogue: true, text: "Hello?" } } },
] } } };

test("completed CineCrew narrative shots become ordered claimable descriptions", () => {
  assert.deepEqual(agentShotsFromRun(run), [
    { sourceId: "shot_1", title: "Shot 1", description: "A traveler opens the door.\nEmotion: uncertainty" },
    { sourceId: "shot_2", title: "Shot 2", description: "The traveler enters.\nDialogue: Hello?" },
  ]);
});

test("unfinished runs, duplicate IDs, and shots without action are rejected", () => {
  assert.throws(() => agentShotsFromRun({ ...run, status: "running" }));
  assert.throws(() => agentShotsFromRun({ status: "completed", output: { blueprint: { shots: [run.output.blueprint.shots[0], run.output.blueprint.shots[0]] } } }));
  assert.throws(() => agentShotsFromRun({ status: "completed", output: { blueprint: { shots: [{ shot_id: "bad", narrative_layer: {} }] } } }));
});
