// Opt in only against a disposable CineMesh database; this test creates two user accounts.
// CINEMESH_INTEGRATION_URL must be the app origin and CINEMESH_INTEGRATION_ALLOW_WRITES=1.
// The accounts are intentionally not deleted; discard the test database after the run.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { allowedOrigin } from "../lib/origin.ts";

const enabled = process.env.CINEMESH_INTEGRATION_ALLOW_WRITES === "1" && !!process.env.CINEMESH_INTEGRATION_URL;

test("production origin check rejects writes without APP_ORIGIN", () => {
  const originalMode = process.env.NODE_ENV;
  const originalOrigin = process.env.APP_ORIGIN;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.APP_ORIGIN;
    assert.equal(allowedOrigin("https://example.test", "https://example.test"), false);
    process.env.APP_ORIGIN = "https://example.test";
    assert.equal(allowedOrigin("https://example.test", "https://example.test"), true);
    assert.equal(allowedOrigin("https://other.test", "https://example.test"), false);
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode;
    if (originalOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = originalOrigin;
  }
});

test("community follow, isolation and validation against PostgreSQL", { skip: !enabled }, async () => {
  const parsed = new URL(process.env.CINEMESH_INTEGRATION_URL);
  assert.ok(["http:", "https:"].includes(parsed.protocol));
  assert.equal(parsed.username, "");
  assert.equal(parsed.password, "");
  assert.equal(parsed.pathname, "/");
  assert.equal(parsed.search, "");
  assert.equal(parsed.hash, "");
  const base = parsed.origin;
  const nonce = randomUUID();

  async function register(name) {
    const result = await fetch(`${base}/api/auth/register`, {
      method: "POST", headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ name, email: `${nonce}-${name}@example.invalid`, password: randomBytes(24).toString("hex") }),
    });
    assert.equal(result.status, 201, "test account registration failed");
    const cookie = result.headers.get("set-cookie");
    assert.ok(cookie, "session cookie missing");
    return { user: await result.json(), cookie: cookie.split(";")[0] };
  }

  async function request(path, account, method = "GET", body, origin = base) {
    const result = await fetch(`${base}${path}`, {
      method,
      headers: { ...(account ? { cookie: account.cookie } : {}), ...(method === "POST" ? { origin, "content-type": "application/json" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: result.status, body: await result.json() };
  }

  const alice = await register(`Alice${nonce.slice(0, 8)}`);
  const bob = await register(`Bob${nonce.slice(0, 8)}`);
  const search = account => `/api/community?q=${encodeURIComponent(account.user.display_name)}`;
  assert.equal((await request("/api/community", null)).status, 401);
  const first = await request(search(bob), alice);
  assert.equal(first.status, 200);
  const entry = first.body.users.find(user => user.id === bob.user.id);
  assert.ok(entry);
  assert.deepEqual(Object.keys(entry).sort(), ["display_name", "followers", "following", "id"]);
  assert.equal(entry.following, false);
  assert.equal((await request("/api/community", alice, "POST", { action: "follow", userId: bob.user.id }, "http://invalid.example")).status, 403);
  assert.equal((await request("/api/community", alice, "POST", { action: "follow", userId: alice.user.id })).status, 400);
  assert.equal((await request("/api/community", alice, "POST", { action: "follow", userId: "invalid" })).status, 400);
  const follow = { action: "follow", userId: bob.user.id };
  assert.deepEqual((await request("/api/community", alice, "POST", follow)).body, { following: true });
  assert.equal((await request("/api/community", alice, "POST", follow)).status, 200);
  const followed = (await request(search(bob), alice)).body.users.find(user => user.id === bob.user.id);
  assert.equal(followed.following, true);
  assert.equal(followed.followers, 1);
  const reverse = (await request(search(alice), bob)).body.users.find(user => user.id === alice.user.id);
  assert.equal(reverse.following, false);
  assert.deepEqual((await request("/api/community", alice, "POST", { action: "unfollow", userId: bob.user.id })).body, { following: false });
  assert.equal((await request(search(bob), alice)).body.users.find(user => user.id === bob.user.id).followers, 0);
});
