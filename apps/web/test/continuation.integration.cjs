// Run only against an explicitly configured disposable CineMesh app and PostgreSQL database.
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const base = process.env.CINEMESH_TEST_URL;
const databaseUrl = process.env.CINEMESH_TEST_DATABASE_URL;
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error("Set CINEMESH_TEST_URL to the local test app");
if (!databaseUrl) throw Error("Set CINEMESH_TEST_DATABASE_URL to the app's disposable PostgreSQL database");

async function request(path, method = "GET", data, cookie) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: { origin: base, ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const rawBody = await response.text();
  let body;
  try { body = JSON.parse(rawBody); }
  catch { throw new Error(`${method} ${path} returned non-JSON HTTP ${response.status}: ${rawBody.slice(0, 240)}`); }
  return { status: response.status, body, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const suffix = randomBytes(8).toString("hex");
    const password = "disposable-test-password-123";
    const owner = await request("auth/register", "POST", { name: "First contributor", email: `first-${suffix}@example.test`, password });
    const memberEmail = `second-${suffix}@example.test`;
    const member = await request("auth/register", "POST", { name: "Second contributor", email: memberEmail, password });
    assert.equal(owner.status, 201); assert.ok(owner.cookie);
    assert.equal(member.status, 201); assert.ok(member.cookie);

    const film = await request("films", "POST", { title: "Continuation test", premise: "Two contributors create consecutive shots.", genre: "Drama", duration_minutes: 1, mode: "collaborative" }, owner.cookie);
    assert.equal(film.status, 201);
    const filmId = film.body.id;
    assert.equal((await request("discover")).body.films.some(item => item.id === filmId), false);
    assert.equal((await request(`watch/${filmId}`)).status, 404, "Draft films are not publicly watchable");
    assert.equal((await request(`films/${filmId}/publish`, "POST", { action: "publish" }, owner.cookie)).status, 409);
    assert.equal((await request(`films/${filmId}/publish`, "POST", { action: "publish" }, member.cookie)).status, 404);
    const matchingDatabase = await pool.query("SELECT owner_id FROM films WHERE id=$1", [filmId]);
    assert.equal(matchingDatabase.rows[0]?.owner_id, owner.body.id, "The disposable PostgreSQL database must be the same database used by the test app");

    assert.equal((await request(`films/${filmId}/collaborators`, "POST", { action: "invite", email: memberEmail, role: "editor" }, owner.cookie)).status, 201);
    assert.equal((await request("collaboration/invitations", "POST", { filmId, action: "accept" }, member.cookie)).status, 200);
    const first = await request(`films/${filmId}/production`, "POST", { action: "create_scene", position: 1, title: "First shot", description: "A traveler opens the door." }, owner.cookie);
    assert.equal(first.status, 201);
    const firstSceneId = first.body.scenes.find(scene => scene.position === 1).id;
    const second = await request(`films/${filmId}/production`, "POST", { action: "create_scene", position: 2, title: "Second shot", description: "The traveler walks through the door." }, member.cookie);
    assert.equal(second.status, 201);
    const secondSceneId = second.body.scenes.find(scene => scene.position === 2).id;
    assert.equal((await request("connections", "POST", { action: "save", keyId: "dummy-id", keySecret: "dummy-secret" }, member.cookie)).status, 200);

    // Seed an expired result so the endpoint exercises contributor and ordering checks without making a paid provider request.
    const firstJobId = randomUUID();
    await pool.query(`INSERT INTO scene_generation_jobs(id,film_id,scene_id,contributor_id,request_key,model_path,prompt,duration_seconds,status,video_url,video_expires_at)
      VALUES($1,$2,$3,$4,$5,'/bytedance/seedance-2.5/text-to-video','A traveler opens the door.',4,'completed',$6,now()-interval '1 hour')`,
      [firstJobId,filmId,firstSceneId,owner.body.id,randomUUID(),"https://example.cloudfront.net/expired.mp4"]);

    const denied = await request(`films/${filmId}/generations`, "POST", { sceneId: secondSceneId, requestKey: randomUUID(), quoteToken: "unverified-test-quote", maxCostUsd: 1 }, owner.cookie);
    assert.equal(denied.status, 403, "The owner cannot use their account to generate another contributor's shot");
    const continuation = await request(`films/${filmId}/generations`, "POST", { sceneId: secondSceneId, requestKey: randomUUID(), referenceGenerationId: firstJobId, quoteToken: "unverified-test-quote", maxCostUsd: 1 }, member.cookie);
    assert.equal(continuation.status, 409);
    assert.match(continuation.body.error, /expired/i, "The first shot must be recognized as earlier before its expired URL is rejected");

    const agentRunId = randomUUID();
    const agentFirst = randomUUID(), agentSecond = randomUUID();
    await pool.query(`INSERT INTO scenes(id,film_id,position,title,description,created_by,agent_run_id,agent_shot_id)
      VALUES($1,$3,3,'Agent shot 1','The first agent-planned action.',NULL,$4,'shot_1'),
            ($2,$3,4,'Agent shot 2','The second agent-planned action.',NULL,$4,'shot_2')`, [agentFirst,agentSecond,filmId,agentRunId]);
    const ownerClaim = await request(`films/${filmId}/production`, "POST", { action: "claim_scene", id: agentFirst }, owner.cookie);
    assert.equal(ownerClaim.status, 200); assert.equal(ownerClaim.body.role, "owner");
    assert.equal(ownerClaim.body.scenes.find(scene => scene.id === agentFirst).mine, true);
    const memberClaim = await request(`films/${filmId}/production`, "POST", { action: "claim_scene", id: agentSecond }, member.cookie);
    assert.equal(memberClaim.status, 200); assert.equal(memberClaim.body.role, "editor");
    assert.equal(memberClaim.body.scenes.find(scene => scene.id === agentSecond).mine, true);
    assert.equal((await request(`films/${filmId}/production`, "POST", { action: "claim_scene", id: agentFirst }, member.cookie)).status, 404);

    const renderId = randomUUID();
    const storageKey = `${filmId}/renders/${randomUUID()}.mp4`;
    const mediaRoot = path.resolve(process.env.CINEMESH_MEDIA_DIR || path.join(__dirname, "../.data/media"));
    const mediaPath = path.resolve(mediaRoot, ...storageKey.split("/"));
    const fixture = Buffer.from(`CineMesh public render authorization fixture ${randomUUID()}`);
    fs.mkdirSync(path.dirname(mediaPath), { recursive: true });
    fs.writeFileSync(mediaPath, fixture, { flag: "wx" });
    try {
      assert.equal((await request(`films/${filmId}/comments`)).body.comments.length, 0, "Draft comments stay private");
      assert.equal((await request(`films/${filmId}/comments`, "POST", { body: "Private draft comment" }, owner.cookie)).status, 404);
      await pool.query(`INSERT INTO media_assets(id,film_id,kind,storage_key,mime_type,size_bytes,sha256,created_by)
        VALUES($1,$2,'film_render',$3,'video/mp4',$4,$5,$6)`,
        [renderId,filmId,storageKey,fixture.length,createHash("sha256").update(fixture).digest("hex"),owner.body.id]);
      assert.equal((await fetch(`${base}/api/media/${renderId}`)).status, 404, "Draft render files stay private");
      const published = await request(`films/${filmId}/publish`, "POST", { action: "publish" }, owner.cookie);
      assert.equal(published.status, 200); assert.equal(published.body.status, "published");
      const discovery = await request("discover");
      assert.equal(discovery.status, 200);
      assert.equal(discovery.body.films.find(item => item.id === filmId).media_asset_id, renderId);
      assert.equal(discovery.body.films.find(item => item.id === filmId).owner_id, owner.body.id);
      const publicProfile = await request(`profiles/${owner.body.id}`);
      assert.equal(publicProfile.status, 200); assert.equal(publicProfile.body.profile.display_name, "First contributor");
      assert.equal("email" in publicProfile.body.profile, false, "Public profiles never expose account email");
      assert.equal(publicProfile.body.films[0].id, filmId, "Profiles list only published saved films");
      assert.equal((await request(`profiles/${randomUUID()}`)).status, 404);
      assert.equal((await request("community", "POST", { action: "follow", userId: owner.body.id })).status, 401, "Following requires a signed-in user");
      const profileFollow = await request("community", "POST", { action: "follow", userId: owner.body.id }, member.cookie);
      assert.equal(profileFollow.status, 200);
      const followedProfile = await request(`profiles/${owner.body.id}`, "GET", undefined, member.cookie);
      assert.equal(followedProfile.body.profile.following, true); assert.equal(followedProfile.body.profile.followers, 1);
      const watchPage = await request(`watch/${filmId}`);
      assert.equal(watchPage.status, 200); assert.equal(watchPage.body.film.media_asset_id, renderId);
      assert.equal(watchPage.body.contributors.length, 2, "Watch details list the filmmaker and film contributors");
      assert.equal(watchPage.body.contributors.find(credit => credit.role === "editor").user_id, member.body.id);
      const publicMedia = await fetch(`${base}/api/media/${renderId}`);
      assert.equal(publicMedia.status, 200, "Published film renders may be streamed without a CineMesh account");
      assert.equal(Buffer.from(await publicMedia.arrayBuffer()).toString(), fixture.toString());
      const initialComments = await request(`films/${filmId}/comments`);
      assert.equal(initialComments.status, 200); assert.deepEqual(initialComments.body.comments, []);
      assert.equal((await request(`films/${filmId}/comments`, "POST", { body: "Anonymous comment" })).status, 401);
      const ownerLike = await request(`films/${filmId}/likes`, "POST", {}, owner.cookie);
      assert.equal(ownerLike.status, 200); assert.equal(ownerLike.body.likes_count, 1); assert.equal(ownerLike.body.liked_by_me, true);
      const duplicateLike = await request(`films/${filmId}/likes`, "POST", {}, owner.cookie);
      assert.equal(duplicateLike.body.likes_count, 1, "Likes are idempotent per user and film");
      const memberLike = await request(`films/${filmId}/likes`, "POST", {}, member.cookie);
      assert.equal(memberLike.body.likes_count, 2);
      const memberUnlike = await request(`films/${filmId}/likes`, "DELETE", {}, member.cookie);
      assert.equal(memberUnlike.body.likes_count, 1); assert.equal(memberUnlike.body.liked_by_me, false);
      assert.equal((await request(`films/${filmId}/likes`, "POST", {}, member.cookie)).body.likes_count, 2);
      const comment = await request(`films/${filmId}/comments`, "POST", { body: "The second shot continues the first." }, member.cookie);
      assert.equal(comment.status, 201); assert.equal(comment.body.comment.author_display_name, "Second contributor");
      const publicComments = await request(`films/${filmId}/comments`);
      assert.equal(publicComments.body.comments.length, 1); assert.equal(publicComments.body.comments[0].id, comment.body.comment.id);
      assert.equal((await request(`films/${filmId}/publish`, "POST", { action: "unpublish" }, owner.cookie)).body.status, "draft");
      assert.equal((await request("discover")).body.films.some(item => item.id === filmId), false);
      assert.equal((await fetch(`${base}/api/media/${renderId}`)).status, 404, "Unpublishing removes public render access");
      assert.equal((await request(`films/${filmId}/comments`)).body.comments.length, 0, "Unpublished films no longer expose comments");
      assert.equal((await request(`films/${filmId}/likes`, "POST", {}, owner.cookie)).status, 404, "Unpublished films no longer accept likes");
      assert.equal((await request(`profiles/${owner.body.id}`)).body.films.length, 0, "Unpublished films leave the public portfolio");
      assert.equal((await request(`watch/${filmId}`)).status, 404, "Unpublished films are not publicly watchable");
      assert.equal((await request("community", "POST", { action: "unfollow", userId: owner.body.id }, member.cookie)).status, 200);
    } finally {
      fs.rmSync(mediaPath, { force: true });
    }

    console.log("PASS: two-user ownership, shot claims, continuation checks, owner-only publish, public Discover playback authorization, and unpublish revocation; no provider generation was submitted");
  } finally { await pool.end(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
