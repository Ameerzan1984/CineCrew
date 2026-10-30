import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseHiggsfieldApiKey, ProviderStateError } from "../src/index.ts";

test("parses a full Higgsfield API credential at the first colon", () => {
  assert.deepEqual(parseHiggsfieldApiKey("  key-id:key-secret:part-two  "), {
    keyId: "key-id",
    keySecret: "key-secret:part-two",
  });
});

test("rejects incomplete, pasted-header, multiline, and oversized credentials", () => {
  for (const value of ["", "missing-separator", ":secret", "id:", "Key id:secret", "id:secret\nother", "x".repeat(1025)]) {
    assert.throws(() => parseHiggsfieldApiKey(value), ProviderStateError);
  }
});
