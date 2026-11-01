import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { encryptLlmApiKey, decryptLlmApiKey, llmVaultReady } from "../lib/llm-api-vault.ts";
import { listOpenAIApiModels } from "../lib/openai-api.ts";

test("LLM vault binds encrypted credentials to user and provider", () => {
  process.env.LLM_VAULT_KEY = randomBytes(32).toString("base64");
  assert.equal(llmVaultReady(), true);
  const value = "test-credential-for-this-unit-test";
  const encrypted = encryptLlmApiKey("user-one", "openai_api", value);
  assert.notEqual(encrypted.includes(value), true);
  assert.equal(decryptLlmApiKey("user-one", "openai_api", encrypted), value);
  assert.throws(() => decryptLlmApiKey("user-two", "openai_api", encrypted));
  assert.throws(() => decryptLlmApiKey("user-one", "other", encrypted));
  delete process.env.LLM_VAULT_KEY;
  assert.equal(llmVaultReady(), false);
});

test("OpenAI API discovery returns provider model IDs without following redirects", async () => {
  const previousFetch = globalThis.fetch;
  let options: RequestInit | undefined;
  try {
    globalThis.fetch = async (_url, init) => {
      options = init;
      return new Response(JSON.stringify({ data: [{ id: "account-model" }, { id: null }] }), { status: 200 });
    };
    assert.deepEqual(await listOpenAIApiModels("unit-test-credential"), [{ id: "account-model", name: "account-model" }]);
    assert.equal(options?.redirect, "error");
    globalThis.fetch = async () => new Response("", { status: 401 });
    await assert.rejects(() => listOpenAIApiModels("unit-test-credential"), /HTTP 401/);
  } finally { globalThis.fetch = previousFetch; }
});
