import assert from "node:assert/strict";
import { test } from "node:test";
import { isCineMeshAdmin } from "../lib/admin.ts";

test("admin allowlist matches complete case-insensitive emails and fails closed", () => {
  const prior = process.env.CINEMESH_ADMIN_EMAILS;
  try {
    delete process.env.CINEMESH_ADMIN_EMAILS;
    assert.equal(isCineMeshAdmin("admin@example.test"), false);
    process.env.CINEMESH_ADMIN_EMAILS = " moderator@example.test, Admin@Example.Test ";
    assert.equal(isCineMeshAdmin("admin@example.test"), true);
    assert.equal(isCineMeshAdmin(" MODERATOR@example.test "), true);
    assert.equal(isCineMeshAdmin("admin@example.test.attacker"), false);
    assert.equal(isCineMeshAdmin(null), false);
  } finally {
    if (prior === undefined) delete process.env.CINEMESH_ADMIN_EMAILS;
    else process.env.CINEMESH_ADMIN_EMAILS = prior;
  }
});
