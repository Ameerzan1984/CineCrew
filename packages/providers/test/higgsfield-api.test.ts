import { strict as assert } from "node:assert";
import { test } from "node:test";
import { HiggsfieldApiClient, HiggsfieldHttpError, ProviderStateError } from "../src/index.ts";

const id = "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff";
const handle = { requestId: id, statusUrl: `https://api.higgsfield.ai/requests/${id}/status`, cancelUrl: `https://api.higgsfield.ai/requests/${id}/cancel` };
const creds = { keyId: "test-id", keySecret: "test-secret" };

test("documented REST lifecycle sends authentication and idempotency and resumes from persisted handle", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return Response.json({ status: "queued", request_id: id, status_url: handle.statusUrl, cancel_url: handle.cancelUrl });
    if (calls.length === 2) return Response.json({ status: "completed", request_id: id, video: { url: "https://media.example/clip.mp4" }, expires_at: "2026-11-01T00:00:00Z" });
    return new Response(null, { status: 202 });
  };
  const client = new HiggsfieldApiClient(creds, fakeFetch);
  assert.equal(client.connectionVerified, false);
  const submitted = await client.submit("/higgsfield-ai/soul/v2/standard", { prompt: "A film" }, "unique-key");
  assert.deepEqual(submitted.handle, handle);
  assert.equal(client.connectionVerified, true);
  assert.equal(calls[0].url, "https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard");
  assert.equal((calls[0].options.headers as Record<string, string>).Authorization, "Key test-id:test-secret");
  assert.equal((calls[0].options.headers as Record<string, string>)["Idempotency-Key"], "unique-key");
  assert.equal(calls[0].options.redirect, "error");
  const resumed = new HiggsfieldApiClient(creds, fakeFetch);
  const result = await resumed.status(submitted.handle);
  assert.deepEqual(result.outputs, [{ kind: "video", url: "https://media.example/clip.mp4" }]);
  assert.equal(result.status, "completed");
  await resumed.cancel(handle);
  assert.equal(calls[2].options.method, "POST");
});

test("rejects malicious endpoints and forged handles before any authenticated request", async () => {
  let calls = 0;
  const client = new HiggsfieldApiClient(creds, async () => { calls++; throw new Error("unexpected"); });
  await assert.rejects(client.submit("//evil.example/path", {}, "key"), ProviderStateError);
  await assert.rejects(client.status({ ...handle, statusUrl: "https://evil.example/status" }), ProviderStateError);
  await assert.rejects(client.status({ ...handle, statusUrl: `${handle.statusUrl}?x=1` }), ProviderStateError);
  assert.equal(calls, 0);
});

test("authentication errors never expose response bodies or secret and do not verify connection", async () => {
  const client = new HiggsfieldApiClient(creds, async () => Response.json({ detail: "test-secret" }, { status: 401 }));
  await assert.rejects(client.status(handle), (error: unknown) => error instanceof HiggsfieldHttpError && error.status === 401 && !error.message.includes("test-secret"));
  assert.equal(client.connectionVerified, false);
});

test("rejects malformed responses and does not imply verification", async () => {
  const client = new HiggsfieldApiClient(creds, async () => Response.json({ status: "mystery", request_id: id }));
  await assert.rejects(client.status(handle), ProviderStateError);
  assert.equal(client.connectionVerified, false);
});

test("does not accept forged status URLs returned by a submission", async () => {
  const client = new HiggsfieldApiClient(creds, async () => Response.json({
    status: "queued", request_id: id, status_url: "https://attacker.example/status", cancel_url: handle.cancelUrl,
  }));
  await assert.rejects(client.submit("/higgsfield-ai/soul/v2/standard", { prompt: "film" }, "unique-key"), ProviderStateError);
  assert.equal(client.connectionVerified, false);
});

test("reports throttling metadata without retrying a generation automatically", async () => {
  let calls = 0;
  const client = new HiggsfieldApiClient(creds, async () => {
    calls++;
    return Response.json({}, { status: 429, headers: { "retry-after": "12", "x-correlation-id": "trace-1" } });
  });
  await assert.rejects(client.submit("/higgsfield-ai/soul/v2/standard", {}, "stable-key"), (error: unknown) =>
    error instanceof HiggsfieldHttpError && error.status === 429 && error.retryAfter === "12" && error.correlationId === "trace-1");
  assert.equal(calls, 1);
});
