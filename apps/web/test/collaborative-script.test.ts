import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildCollaborativeScript } from "../lib/collaborative-script.ts";

test("agent brief contains every contributor shot in production order with attribution", () => {
  const script = buildCollaborativeScript("Join these scene ideas into a short film.", [
    { position: 2, title: "The bridge", description: "Mara finds the package.", contributor: "Bob" },
    { position: 1, title: "The station", description: "Mara hears the last train leave.", contributor: "Alice" },
  ]);
  assert.ok(script.indexOf("Shot 1: The station") < script.indexOf("Shot 2: The bridge"));
  assert.match(script, /Contributor: Alice/);
  assert.match(script, /Contributor: Bob/);
  assert.match(script, /connect them into one coherent film/);
});

test("agent brief remains valid when no team contributions exist", () => {
  assert.equal(buildCollaborativeScript("  A short scene.  ", []), "A short scene.");
});
