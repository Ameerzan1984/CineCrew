import { test } from "node:test";
import { strict as assert } from "node:assert";
import { callFilmEngine } from "../lib/film-engine-client.ts";

test("film engine requests never follow redirects with user credentials", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.FILM_ENGINE_URL;
  const previousToken = process.env.FILM_ENGINE_SERVICE_TOKEN;
  process.env.FILM_ENGINE_URL = "test-engine-service";
  process.env.FILM_ENGINE_SERVICE_TOKEN = "test-service-token";
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  try {
    globalThis.fetch = async (url, init) => { capturedUrl = String(url); capturedInit = init; return new Response("{}", { status: 200 }); };
    await callFilmEngine("/films/example", { method: "POST", headers: { "X-LLM-API-Key": "unit-test-key" } });
    assert.equal(capturedInit?.redirect, "error");
    assert.equal(capturedUrl.includes("unit-test-key"), false);
    assert.equal((capturedInit?.headers as Record<string, string>)["X-LLM-API-Key"], "unit-test-key");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.FILM_ENGINE_URL; else process.env.FILM_ENGINE_URL = previousUrl;
    if (previousToken === undefined) delete process.env.FILM_ENGINE_SERVICE_TOKEN; else process.env.FILM_ENGINE_SERVICE_TOKEN = previousToken;
  }
});
