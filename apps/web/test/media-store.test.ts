import { strict as assert } from "node:assert";
import { test } from "node:test";
import path from "node:path";
import { isTrustedHiggsfieldOutput, safeMediaPath } from "../lib/media-store.ts";

test("media keys remain confined beneath the private media directory", () => {
  const root = path.resolve("private-media");
  assert.equal(safeMediaPath(root,"film-id/clips/clip-id.mp4"),path.join(root,"film-id","clips","clip-id.mp4"));
  for (const key of ["../outside.mp4","film/../../outside.mp4","/outside.mp4","film\\clip.mp4","film//clip.mp4"]) {
    assert.throws(() => safeMediaPath(root,key));
  }
});

test("provider downloads accept only HTTPS Higgsfield or CloudFront output URLs", () => {
  assert.equal(isTrustedHiggsfieldOutput("https://d3example.cloudfront.net/clip.mp4?sig=test"),true);
  assert.equal(isTrustedHiggsfieldOutput("https://cdn.higgsfield.ai/video.mp4"),true);
  for (const url of ["http://d3example.cloudfront.net/clip.mp4","https://localhost/clip.mp4","https://higgsfield.ai@attacker.example/clip.mp4","https://d3example.cloudfront.net:8443/clip.mp4"]) {
    assert.equal(isTrustedHiggsfieldOutput(url),false);
  }
});
