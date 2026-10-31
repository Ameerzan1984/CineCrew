import { strict as assert } from "node:assert";
import { test } from "node:test";
import { agentShotsFromRun } from "../lib/agent-shots.ts";

const run = { status: "completed", output: { blueprint: { shots: [
  { shot_id: "shot_1", narrative_layer: { narrative_action: "A traveler opens the door.", emotional_beat: "uncertainty", dialogue: { has_dialogue: false, text: "ignored" } } },
  { shot_id: "shot_2", narrative_layer: { narrative_action: "The traveler enters.", dialogue: { has_dialogue: true, text: "Hello?" } } },
  ] }, video_jobs: { jobs: [
    { job_id: "scene_shot_1_single", shot_id: "shot_1", segment_id: "shot_1_single", prompt: "Resolved prompt one", duration: 5 },
    { job_id: "scene_shot_1_afterglow", shot_id: "shot_1", segment_id: "shot_1_afterglow", prompt: "Resolved prompt one afterglow", duration: 4 },
    { job_id: "scene_shot_2_dialogue_core", shot_id: "shot_2", segment_id: "shot_2_dialogue_core", prompt: "Resolved prompt two", duration: 2 },
  ] } } };

test("completed CineCrew narrative shots become ordered claimable descriptions", () => {
  assert.deepEqual(agentShotsFromRun(run), [
    { sourceId: "shot_1", jobId: "scene_shot_1_single", title: "Shot 1", description: "A traveler opens the door.\nEmotion: uncertainty", prompt: "Resolved prompt one", plannedDurationSeconds: 5, generationDurationSeconds: 5 },
    { sourceId: "shot_1", jobId: "scene_shot_1_afterglow", title: "Shot 1 - shot_1_afterglow", description: "A traveler opens the door.\nEmotion: uncertainty", prompt: "Resolved prompt one afterglow", plannedDurationSeconds: 4, generationDurationSeconds: 4 },
    { sourceId: "shot_2", jobId: "scene_shot_2_dialogue_core", title: "Shot 2 - shot_2_dialogue_core", description: "The traveler enters.\nDialogue: Hello?", prompt: "Resolved prompt two", plannedDurationSeconds: 2, generationDurationSeconds: 4 },
  ]);
});

test("unfinished runs, duplicate IDs, and shots without action are rejected", () => {
  assert.throws(() => agentShotsFromRun({ ...run, status: "running" }));
  assert.throws(() => agentShotsFromRun({ status: "completed", output: { blueprint: { shots: [run.output.blueprint.shots[0], run.output.blueprint.shots[0]] } } }));
  assert.throws(() => agentShotsFromRun({ status: "completed", output: { blueprint: { shots: [{ shot_id: "bad", narrative_layer: {} }] } } }));
  assert.throws(() => agentShotsFromRun({ status: "completed", output: { blueprint: run.output.blueprint } }));
});
