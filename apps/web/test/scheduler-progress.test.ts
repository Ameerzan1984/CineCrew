import test from "node:test";
import assert from "node:assert/strict";
import { readSchedulerProgress } from "../lib/scheduler-progress.ts";

const film = "e551d75f-f448-43c5-8ec5-703674eea091";
const actor = "2e91a788-8217-4415-b05d-c381f005a2c7";

test("scheduler progress uses only trusted server credentials and validates counts", async () => {
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.equal(String(input), `http://127.0.0.1:8002/projects/${film}/progress`);
    assert.equal(new Headers(init?.headers).get("X-Cinemesh-Actor"), actor);
    assert.equal(new Headers(init?.headers).get("X-Cinemesh-Service-Token"), "test-token");
    assert.equal(init?.redirect, "error");
    return new Response(JSON.stringify({ running: 2, completed: 1 }));
  };
  assert.deepEqual(await readSchedulerProgress("http://127.0.0.1:8002", "test-token", film, actor, fakeFetch),
    { queued: 0, running: 2, uncertain: 0, completed: 1, failed: 0 });
  const badFetch: typeof fetch = async () => new Response(JSON.stringify({ running: -1 }));
  await assert.rejects(() => readSchedulerProgress("http://127.0.0.1:8002", "test-token", film, actor, badFetch), /Invalid scheduler response/);
  await assert.rejects(() => readSchedulerProgress("http://127.0.0.1:8002/path", "test-token", film, actor, fakeFetch), /Scheduler unavailable/);
  await assert.rejects(() => readSchedulerProgress("http://127.0.0.1:8002", "", film, actor, fakeFetch), /Scheduler unavailable/);
});
