import { strict as assert } from "node:assert";
import { test } from "node:test";
import { HiggsfieldProvider, MockProvider, ProviderStateError, ProviderUnavailableError } from "../src/index.ts";

test("mock is explicit, idempotent and produces no media", async () => {
  const provider = new MockProvider();
  await assert.rejects(provider.createGenerationJob({ prompt: "a film", idempotencyKey: "one" }), ProviderStateError);
  await provider.connect();
  assert.equal((await provider.getCapabilities()).simulated, true);
  const job = await provider.createGenerationJob({ prompt: "a film", idempotencyKey: "one" });
  assert.equal((await provider.createGenerationJob({ prompt: "a film", idempotencyKey: "one" })).id, job.id);
  await assert.rejects(provider.createGenerationJob({ prompt: "a different film", idempotencyKey: "one" }), ProviderStateError);
  assert.deepEqual(await provider.fetchOutput(job.id), { simulated: true, description: "Simulated result; no media was generated." });
  assert.equal((await provider.getJobStatus(job.id)).status, "completed");
  assert.equal((await provider.getUsage()).jobsCreated, 1);
  assert.deepEqual(await provider.getBalance(), { available: false, amount: null, currency: null });
});

test("cancelled mock jobs cannot produce output", async () => {
  const provider = new MockProvider();
  await provider.connect();
  const job = await provider.createGenerationJob({ prompt: "a film", idempotencyKey: "two" });
  assert.equal((await provider.cancelJob(job.id)).status, "cancelled");
  await assert.rejects(provider.fetchOutput(job.id), ProviderStateError);
});

test("both Higgsfield transports fail closed", async () => {
  for (const transport of ["mcp", "api"] as const) {
    const provider = new HiggsfieldProvider(transport);
    assert.equal((await provider.getCapabilities()).available, false);
    await assert.rejects(provider.connect(), ProviderUnavailableError);
    await assert.rejects(provider.createGenerationJob({ prompt: "film", idempotencyKey: "three" }), ProviderUnavailableError);
    await assert.rejects(provider.getBalance(), ProviderUnavailableError);
  }
});
