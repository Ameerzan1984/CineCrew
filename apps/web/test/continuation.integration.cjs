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

async function request(path, method = "GET", data, cookie, origin = base) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: { origin, ...(cookie ? { cookie } : {}), ...(data ? { "content-type": "application/json" } : {}) },
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
    let moderationAdmin;
    const adminEmail = "cinemesh-ci-admin@example.test";
    if ((process.env.CINEMESH_ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).includes(adminEmail)) {
      const adminPassword = "CineMesh-CI-Admin-Test-Only-2026!";
      moderationAdmin = await request("auth/register", "POST", { name: "CineMesh Test Moderator", email: adminEmail, password: adminPassword });
      assert.equal(moderationAdmin.status, 201); assert.ok(moderationAdmin.cookie);
      assert.equal((await request("admin/session")).status, 401);
      assert.equal((await request("admin/reports")).status, 401);
      assert.equal((await request("admin/session", "GET", undefined, owner.cookie)).status, 403);
      assert.equal((await request("admin/reports", "GET", undefined, owner.cookie)).status, 403);
      assert.equal((await request("reports", "POST", { targetType: "user", targetId: owner.body.id, category: "other" }, owner.cookie)).status, 400,
        "Users cannot report themselves");
      const userReport = await request("reports", "POST", { targetType: "user", targetId: member.body.id, category: "harassment", details: "A private report detail." }, owner.cookie);
      assert.equal(userReport.status, 201);
      assert.equal((await request("reports", "POST", { targetType: "user", targetId: member.body.id, category: "spam" }, owner.cookie)).status, 409,
        "An active report cannot be duplicated by the same account");
      const queue = await request("admin/reports", "GET", undefined, moderationAdmin.cookie);
      assert.equal(queue.status, 200);
      assert.equal(queue.body.reports[0].target_name, "Second contributor");
      assert.equal("email" in queue.body.reports[0], false, "The moderation list never exposes reporter or target email");
      assert.equal((await request("admin/reports", "POST", { reportId: userReport.body.report.id, action: "dismiss" }, owner.cookie)).status, 403);
      assert.equal((await request("admin/reports", "POST", { reportId: userReport.body.report.id, action: "dismiss" }, moderationAdmin.cookie)).status, 200);
      const audit = await pool.query("SELECT action FROM moderation_actions WHERE report_id=$1", [userReport.body.report.id]);
      assert.deepEqual(audit.rows.map(row => row.action), ["dismiss"]);
    }
    assert.equal((await request("notifications")).status, 401, "Notification access requires a CineMesh account");

    const film = await request("films", "POST", { title: "Continuation test", premise: "Two contributors create consecutive shots.", genre: "Drama", duration_minutes: 1, mode: "collaborative" }, owner.cookie);
    assert.equal(film.status, 201);
    const filmId = film.body.id;
    assert.equal((await request("discover")).body.films.some(item => item.id === filmId), false);
    assert.equal((await request(`watch/${filmId}`)).status, 404, "Draft films are not publicly watchable");
    assert.equal((await request(`films/${filmId}/publish`, "POST", { action: "publish" }, owner.cookie)).status, 409);
    assert.equal((await request(`films/${filmId}/publish`, "POST", { action: "publish" }, member.cookie)).status, 404);
    const matchingDatabase = await pool.query("SELECT owner_id FROM films WHERE id=$1", [filmId]);
    assert.equal(matchingDatabase.rows[0]?.owner_id, owner.body.id, "The disposable PostgreSQL database must be the same database used by the test app");

    const engineLink = await request(`films/${filmId}/engine/connect`, "POST", {}, owner.cookie);
    assert.equal(engineLink.status, 200, "The owner links the film to the private engine before listing agent runs");
    const savedRunId = randomUUID();
    await pool.query(`INSERT INTO film_agent_runs(run_id,film_id,created_by,model,status,stage)
      VALUES($1,$2,$3,'test-model','running','cinematographer')`, [savedRunId,filmId,owner.body.id]);
    const ownerRunHistory = await request(`films/${filmId}/agents/story-editor/runs`, "GET", undefined, owner.cookie);
    assert.equal(ownerRunHistory.status, 200);
    assert.equal(ownerRunHistory.body.runs[0].id, savedRunId, "Run IDs are discoverable from PostgreSQL without browser storage");
    assert.equal(ownerRunHistory.body.runs[0].can_resume, true, "Only the contributor who supplied this run's model credentials may resume it");
    assert.equal("access_token" in ownerRunHistory.body.runs[0], false, "Run history never exposes provider credentials");
    assert.equal((await request(`films/${filmId}/agents/story-editor/runs`, "GET", undefined, member.cookie)).status, 404,
      "A pending invite cannot discover film agent runs");
    assert.equal((await request(`films/${filmId}/agents/story-editor?run_id=${savedRunId}`, "GET", undefined, owner.cookie)).status, 410,
      "The gateway reports a missing engine checkpoint instead of pretending a PostgreSQL index is the saved output");

    assert.equal((await request("notifications", "GET", undefined, member.cookie)).body.notifications.length, 0);
    assert.equal((await request(`films/${filmId}/collaborators`, "POST", { action: "invite", email: memberEmail, role: "editor" }, owner.cookie)).status, 201);
    const memberInviteInbox = await request("notifications", "GET", undefined, member.cookie);
    assert.equal(memberInviteInbox.status, 200);
    assert.equal(memberInviteInbox.body.notifications.length, 1, "A new film invitation creates one recipient notification");
    const inviteNotification = memberInviteInbox.body.notifications[0];
    assert.equal(inviteNotification.notification_type, "film_invitation");
    assert.equal(inviteNotification.film_id, filmId);
    assert.equal(inviteNotification.actor_display_name, "First contributor");
    assert.equal(inviteNotification.read_at, null);
    assert.equal(memberInviteInbox.body.unread_count, 1);
    assert.equal((await request("notifications", "GET", undefined, owner.cookie)).body.notifications.length, 0,
      "The inviter cannot read the invitee's private notification");
    assert.equal((await request("notifications", "POST", { action: "read", notificationId: inviteNotification.id }, owner.cookie)).status, 404,
      "A user cannot mark another account's notification as read");
    assert.equal((await request(`films/${filmId}/collaborators`, "POST", { action: "invite", email: memberEmail, role: "editor" }, owner.cookie)).status, 201);
    assert.equal((await request("notifications", "GET", undefined, member.cookie)).body.notifications.length, 1,
      "Retrying an already-pending invitation does not create notification spam");
    const markInviteRead = await request("notifications", "POST", { action: "read", notificationId: inviteNotification.id }, member.cookie);
    assert.equal(markInviteRead.status, 200); assert.equal(markInviteRead.body.read, true); assert.equal(markInviteRead.body.unread_count, 0);
    const repeatedMarkRead = await request("notifications", "POST", { action: "read", notificationId: inviteNotification.id }, member.cookie);
    assert.equal(repeatedMarkRead.status, 200);
    assert.equal(repeatedMarkRead.body.read_at, markInviteRead.body.read_at, "Mark-read is idempotent");
    assert.equal((await request("notifications", "GET", undefined, member.cookie)).body.notifications[0].read_at, markInviteRead.body.read_at);
    assert.equal((await request("collaboration/invitations", "POST", { filmId, action: "accept" }, member.cookie)).status, 200);
    const ownerAcceptanceInbox = await request("notifications", "GET", undefined, owner.cookie);
    assert.equal(ownerAcceptanceInbox.body.notifications.length, 1, "Accepting an invite creates a notification for its inviter");
    assert.equal(ownerAcceptanceInbox.body.notifications[0].notification_type, "invitation_accepted");
    assert.equal(ownerAcceptanceInbox.body.notifications[0].actor_display_name, "Second contributor");
    assert.equal((await request("collaboration/invitations", "POST", { filmId, action: "accept" }, member.cookie)).status, 404);
    assert.equal((await request("notifications", "GET", undefined, owner.cookie)).body.notifications.length, 1,
      "Retrying an already-accepted invitation does not duplicate the response notification");
    const editorRunHistory = await request(`films/${filmId}/agents/story-editor/runs`, "GET", undefined, member.cookie);
    assert.equal(editorRunHistory.status, 200);
    assert.equal(editorRunHistory.body.runs[0].id, savedRunId, "Accepted editors can restore shared film run history");
    assert.equal(editorRunHistory.body.runs[0].can_resume, false, "A collaborator must not be able to resume another contributor's provider job with their credential");
    const first = await request(`films/${filmId}/production`, "POST", { action: "create_scene", position: 1, title: "First shot", description: "A traveler opens the door." }, owner.cookie);
    assert.equal(first.status, 201);
    const firstSceneId = first.body.scenes.find(scene => scene.position === 1).id;
    const second = await request(`films/${filmId}/production`, "POST", { action: "create_scene", position: 2, title: "Second shot", description: "The traveler walks through the door." }, member.cookie);
    assert.equal(second.status, 201);
    const secondSceneId = second.body.scenes.find(scene => scene.position === 2).id;
    assert.equal((await request("connections", "POST", { action: "save", keyId: "dummy-id", keySecret: "dummy-secret" }, member.cookie)).status, 200);
    const deniedEstimate = await request(`films/${filmId}/generations/estimate`, "POST", { sceneId: secondSceneId, requestKey: randomUUID() }, owner.cookie);
    assert.equal(deniedEstimate.status, 403, "A film owner cannot request a quote using another contributor's provider account");
    const unavailableEstimate = await request(`films/${filmId}/generations/estimate`, "POST", { sceneId: secondSceneId, requestKey: randomUUID() }, member.cookie);
    assert.equal(unavailableEstimate.status, 503);
    assert.equal(unavailableEstimate.body.error, "HIGGSFIELD_PRICE_ESTIMATE_UNVERIFIED");
    assert.equal("quoteToken" in unavailableEstimate.body, false, "An undocumented estimate contract must not create a spend token");

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
      if (moderationAdmin?.cookie) {
        assert.equal((await request("reports", "POST", { targetType: "film", targetId: filmId, category: "copyright", details: "Check usage rights." }, member.cookie)).status, 201);
        const filmReport = (await request("admin/reports", "GET", undefined, moderationAdmin.cookie)).body.reports.find(item => item.target_type === "film" && item.target_id === filmId);
        assert.ok(filmReport, "A collaborator can report the shared published film");
        assert.equal((await request("admin/reports", "POST", { reportId: filmReport.id, action: "hide_film" }, owner.cookie)).status, 403,
          "Only the configured moderator may hide a reported film");
        assert.equal((await request("admin/reports", "POST", { reportId: filmReport.id, action: "hide_film" }, moderationAdmin.cookie, "http://invalid.example")).status, 403,
          "Moderation actions enforce request origin");
        assert.equal((await request("admin/reports", "POST", { reportId: filmReport.id, action: "hide_film", note: "Policy review." }, moderationAdmin.cookie)).status, 200);
        assert.equal((await request("discover")).body.films.some(item => item.id === filmId), false);
        assert.equal((await request(`watch/${filmId}`)).status, 404);
        assert.equal((await fetch(`${base}/api/media/${renderId}`)).status, 404, "A moderated render is no longer public");
        const deniedRepublish = await request(`films/${filmId}/publish`, "POST", { action: "publish" }, owner.cookie);
        assert.equal(deniedRepublish.status, 409);
        assert.match(deniedRepublish.body.error, /moderator/i);
        assert.equal((await request("admin/reports", "POST", { reportId: filmReport.id, action: "restore_film", note: "Reviewed and restored." }, moderationAdmin.cookie)).status, 200);
        assert.equal((await request("discover")).body.films.some(item => item.id === filmId), true);
        const actions = await pool.query("SELECT action FROM moderation_actions WHERE report_id=$1 ORDER BY created_at,id", [filmReport.id]);
        assert.deepEqual(actions.rows.map(row => row.action), ["hide_film", "restore_film"]);
        assert.equal((await request("admin/reports", "POST", { reportId: filmReport.id, action: "dismiss" }, moderationAdmin.cookie)).status, 200);
      }
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
      assert.equal((await request(`films/${filmId}/collaborators`, "POST", { action: "remove", userId: member.body.id }, owner.cookie)).status, 200);
      assert.equal((await request(`films/${filmId}/collaborators`, "POST", { action: "invite", email: memberEmail, role: "viewer" }, owner.cookie)).status, 201,
        "A revoked invitation can be reissued with a fresh notification");
      const reissuedInbox = await request("notifications", "GET", undefined, member.cookie);
      assert.equal(reissuedInbox.body.notifications.filter(item => item.notification_type === "film_invitation").length, 2);
      const reissuedNotification = reissuedInbox.body.notifications.find(item => item.notification_type === "film_invitation" && item.role === "viewer");
      assert.ok(reissuedNotification && reissuedNotification.id !== inviteNotification.id);
      assert.equal((await request("collaboration/invitations", "POST", { filmId, action: "decline" }, member.cookie)).status, 200);
      const ownerDeclineInbox = await request("notifications", "GET", undefined, owner.cookie);
      assert.equal(ownerDeclineInbox.body.notifications.filter(item => item.notification_type === "invitation_declined").length, 1,
        "Declining an invite notifies the inviter exactly once");
      assert.equal(ownerDeclineInbox.body.unread_count, 2, "Accepted and declined events are both unread for the inviter");
    } finally {
      fs.rmSync(mediaPath, { force: true });
    }

    console.log("PASS: two-user ownership, shot claims, continuation checks, owner-only publish, public Discover playback authorization, and unpublish revocation; no provider generation was submitted");
  } finally { await pool.end(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
