// Run only against an explicitly configured disposable CineMesh app and PostgreSQL database.
const { randomBytes, randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
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
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
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

    const denied = await request(`films/${filmId}/generations`, "POST", { sceneId: secondSceneId, requestKey: randomUUID() }, owner.cookie);
    assert.equal(denied.status, 403, "The owner cannot use their account to generate another contributor's shot");
    const continuation = await request(`films/${filmId}/generations`, "POST", { sceneId: secondSceneId, requestKey: randomUUID(), referenceGenerationId: firstJobId }, member.cookie);
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
    console.log("PASS: two-user ownership, agent shot claims, and earlier-shot continuation checks; no provider generation was submitted");
  } finally { await pool.end(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
