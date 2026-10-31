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
    assert.equal((await request(`films/${filmId}/reviews`)).status, 404, "Draft film reviews are not publicly visible");
    assert.equal((await request(`films/${filmId}/reviews`, "PUT", { rating: 5, body: "Draft review" }, owner.cookie)).status, 404,
      "A draft film cannot receive a review before publication");
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

    const reorderedUp = await request(`films/${filmId}/production`, "POST", { action: "move_scene", id: secondSceneId, direction: "up" }, owner.cookie);
    assert.equal(reorderedUp.status, 200);
    assert.deepEqual(reorderedUp.body.scenes.slice(0,2).map(scene => scene.title), ["Second shot", "First shot"]);
    const persistedOrder = await request(`films/${filmId}/production`, "GET", undefined, owner.cookie);
    assert.deepEqual(persistedOrder.body.scenes.slice(0,2).map(scene => scene.id), [secondSceneId, firstSceneId], "Timeline order persists when reloaded from PostgreSQL");
    const movedDown = await request(`films/${filmId}/production`, "POST", { action: "move_scene", id: secondSceneId, direction: "down" }, owner.cookie);
    assert.equal(movedDown.status, 200);
    assert.deepEqual(movedDown.body.scenes.slice(0,2).map(scene => scene.title), ["First shot", "Second shot"]);
    const restoredOrder = await request(`films/${filmId}/production`, "POST", { action: "move_scene", id: secondSceneId, direction: "up" }, owner.cookie);
    assert.equal(restoredOrder.status, 200);
    assert.equal((await request(`films/${filmId}/production`, "POST", { action: "move_scene", id: secondSceneId, direction: "up" }, owner.cookie)).status, 409, "A shot at the first position cannot move above the timeline");
    assert.equal((await request(`films/${filmId}/production`, "POST", { action: "move_scene", id: secondSceneId, direction: "down" }, member.cookie)).status, 403, "A shot contributor cannot reorder the shared timeline");
    const finalOrder = await request(`films/${filmId}/production`, "GET", undefined, owner.cookie);
    assert.deepEqual(finalOrder.body.scenes.slice(0,2).map(scene => scene.id), [secondSceneId, firstSceneId]);

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
      assert.equal((await request("lists")).status, 401, "Private list management requires a CineMesh account");
      assert.equal((await request("lists/public")).status, 200, "Public list discovery does not require sign-in");
      assert.equal((await request("lists", "POST", { name: "Guest list" })).status, 401);
      assert.equal((await request("lists", "POST", { name: "  ", visibility: "public" }, owner.cookie)).status, 400);
      assert.equal((await request("lists", "POST", { name: "Bad description", description: 12 }, owner.cookie)).status, 400);
      const publicList = await request("lists", "POST", { name: "Night photography", description: "Films with quiet urban lighting.", visibility: "public" }, owner.cookie);
      assert.equal(publicList.status, 201); assert.equal(publicList.body.list.visibility, "public");
      const privateList = await request("lists", "POST", { name: "Reference cuts" }, owner.cookie);
      assert.equal(privateList.status, 201); assert.equal(privateList.body.list.visibility, "private");
      assert.equal((await request("lists", "POST", { name: "night photography", visibility: "private" }, owner.cookie)).status, 409,
        "List names are unique per owner ignoring case");
      assert.equal((await request(`lists/${privateList.body.list.id}`)).status, 404, "Private lists stay hidden from guests");
      assert.equal((await request(`lists/${privateList.body.list.id}`, "GET", undefined, member.cookie)).status, 404,
        "Private lists stay hidden from other accounts");
      assert.equal((await request(`lists/${privateList.body.list.id}`, "GET", undefined, owner.cookie)).status, 200);
      const updatedPrivateList = await request(`lists/${privateList.body.list.id}`, "PATCH", { name: "Reference cuts", description: "Private continuity notes.", visibility: "public" }, owner.cookie);
      assert.equal(updatedPrivateList.status, 200); assert.equal(updatedPrivateList.body.list.visibility, "public");
      assert.equal((await request("lists/public")).body.lists.some(item => item.id === privateList.body.list.id), true,
        "Changing a private list to public adds it to list discovery");
      const sharedListForMember = await request(`lists/${publicList.body.list.id}`, "GET", undefined, member.cookie);
      assert.equal(sharedListForMember.status, 200, "Published public lists can be read by other accounts");
      assert.equal((await request(`lists/${publicList.body.list.id}`, "GET")).status, 200, "Published public lists can be read anonymously");
      assert.equal((await request(`lists/${publicList.body.list.id}`, "PATCH", { visibility: "private" }, member.cookie)).status, 404,
        "Only the list owner can change its visibility");
      const savedListFilm = await request(`lists/${publicList.body.list.id}/items`, "POST", { filmId }, owner.cookie);
      assert.equal(savedListFilm.status, 200); assert.equal(savedListFilm.body.added, true); assert.equal(savedListFilm.body.item_count, 1);
      const duplicateListFilm = await request(`lists/${publicList.body.list.id}/items`, "POST", { filmId }, owner.cookie);
      assert.equal(duplicateListFilm.status, 200); assert.equal(duplicateListFilm.body.added, false, "Adding a film twice is idempotent");
      const draftListFilm = await request("films", "POST", { title: "Unpublished list item", premise: "A draft must never enter a film list.", genre: "Drama", duration_minutes: 1 }, owner.cookie);
      assert.equal((await request(`lists/${publicList.body.list.id}/items`, "POST", { filmId: draftListFilm.body.id }, owner.cookie)).status, 404,
        "Only published films with saved renders can enter a list");
      assert.equal((await request(`lists/${publicList.body.list.id}/items`, "POST", { filmId }, member.cookie)).status, 404,
        "Only the list owner can modify a public list");
      assert.equal((await request(`lists/${publicList.body.list.id}/items`, "DELETE", { filmId }, member.cookie)).status, 404);
      const removedListFilm = await request(`lists/${publicList.body.list.id}/items`, "DELETE", { filmId }, owner.cookie);
      assert.equal(removedListFilm.status, 200); assert.equal(removedListFilm.body.removed, true); assert.equal(removedListFilm.body.item_count, 0);
      assert.equal((await request(`lists/${publicList.body.list.id}/items`, "POST", { filmId }, owner.cookie, "http://invalid.example")).status, 403,
        "List mutations enforce request origin");
      assert.equal((await request(`lists/${publicList.body.list.id}/items`, "POST", { filmId }, owner.cookie)).body.added, true);
      assert.equal((await request(`lists/${publicList.body.list.id}`, "DELETE", {}, member.cookie)).status, 404);
      const sharedList = await request(`lists/${publicList.body.list.id}`);
      assert.equal(sharedList.body.items.length, 1); assert.equal(sharedList.body.items[0].id, filmId);
      const ownLists = await request("lists", "GET", undefined, owner.cookie);
      assert.equal(ownLists.body.lists.length, 2); assert.equal(ownLists.body.lists.find(item => item.id === publicList.body.list.id).item_count, 1);
      assert.equal((await request("lists", "GET", undefined, member.cookie)).body.lists.length, 0,
        "Each account sees only its own list-management entries");
      const discovery = await request("discover");
      assert.equal(discovery.status, 200);
      assert.equal(discovery.body.films.find(item => item.id === filmId).media_asset_id, renderId);
      assert.equal(discovery.body.films.find(item => item.id === filmId).owner_id, owner.body.id);
      const publicProfile = await request(`profiles/${owner.body.id}`);
      assert.equal(publicProfile.status, 200); assert.equal(publicProfile.body.profile.display_name, "First contributor");
      assert.equal(publicProfile.body.profile.bio, "");
      assert.equal("email" in publicProfile.body.profile, false, "Public profiles never expose account email");
      assert.equal(publicProfile.body.films[0].id, filmId, "Profiles list only published saved films");
      assert.equal((await request(`profiles/${randomUUID()}`)).status, 404);
      assert.equal((await request(`profiles/${owner.body.id}`, "PATCH", { bio: "Unauthorized" })).status, 401,
        "Editing a profile requires authentication");
      assert.equal((await request(`profiles/${owner.body.id}`, "PATCH", { bio: "Unauthorized" }, member.cookie)).status, 403,
        "A member cannot edit another account's profile");
      assert.equal((await request(`profiles/${owner.body.id}`, "PATCH", { bio: "x".repeat(501) }, owner.cookie)).status, 400,
        "Profile bio length is validated before writing");
      assert.equal((await request(`profiles/${owner.body.id}`, "PATCH", { bio: "Blocked origin" }, owner.cookie, "http://invalid.example")).status, 403,
        "Profile edits enforce request origin");
      const savedBio = await request(`profiles/${owner.body.id}`, "PATCH", { bio: "  Filmmaker and storyteller.  " }, owner.cookie);
      assert.equal(savedBio.status, 200); assert.equal(savedBio.body.profile.bio, "Filmmaker and storyteller.");
      assert.equal((await request(`profiles/${owner.body.id}`)).body.profile.bio, savedBio.body.profile.bio,
        "The public profile returns its persisted bio");
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
      assert.equal((await request(`films/${filmId}/comments`, "POST", { body: "Anonymous reply", parentCommentId: randomUUID() })).status, 401,
        "Replies require the same authenticated account as top-level comments");
      assert.equal((await request(`films/${filmId}/comments`, "POST", { body: "Invalid reply", parentCommentId: "not-a-uuid" }, member.cookie)).status, 400);
      const emptyReviews = await request(`films/${filmId}/reviews`);
      assert.equal(emptyReviews.status, 200); assert.equal(emptyReviews.body.summary.review_count, 0);
      assert.equal(emptyReviews.body.summary.average_rating, 0); assert.equal(emptyReviews.body.my_review, null);
      assert.equal((await request(`films/${filmId}/reviews`, "PUT", { rating: 5, body: "Anonymous review" })).status, 401,
        "Writing a review requires an authenticated CineMesh account");
      assert.equal((await request(`films/${filmId}/reviews`, "PUT", { rating: 6, body: "Invalid rating" }, member.cookie)).status, 400);
      assert.equal((await request(`films/${filmId}/reviews`, "PUT", { rating: 4, body: "   " }, member.cookie)).status, 400);
      const ownerReview = await request(`films/${filmId}/reviews`, "PUT", { rating: 3, body: "The film has a patient rhythm." }, owner.cookie);
      assert.equal(ownerReview.status, 200); assert.equal(ownerReview.body.review.author_display_name, "First contributor");
      const memberReview = await request(`films/${filmId}/reviews`, "PUT", { rating: 4, body: "The second shot follows the first." }, member.cookie);
      assert.equal(memberReview.status, 200); assert.equal(memberReview.body.summary.review_count, 2);
      const memberUpdate = await request(`films/${filmId}/reviews`, "PUT", { rating: 5, body: "The second shot follows the first beautifully." }, member.cookie);
      assert.equal(memberUpdate.status, 200); assert.equal(memberUpdate.body.summary.average_rating, 4);
      const reviewRows = await pool.query("SELECT author_id,rating,body FROM film_reviews WHERE film_id=$1 ORDER BY author_id", [filmId]);
      assert.equal(reviewRows.rowCount, 2, "Each account has one persistent review per film");
      assert.equal(reviewRows.rows.find(row => row.author_id === member.body.id).rating, 5, "Updating a review replaces that contributor's rating");
      const publicReviews = await request(`films/${filmId}/reviews`);
      assert.equal(publicReviews.body.reviews.length, 2); assert.equal(publicReviews.body.my_review, null);
      const signedReviews = await request(`films/${filmId}/reviews`, "GET", undefined, member.cookie);
      assert.equal(signedReviews.body.my_review.id, memberUpdate.body.review.id);
      assert.equal(signedReviews.body.reviews.find(review => review.id === memberUpdate.body.review.id).is_own, true);
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
        assert.equal((await request(`films/${filmId}/reviews`)).status, 404, "Moderated films hide their review list");
        assert.equal((await request(`films/${filmId}/reviews`, "PUT", { rating: 2, body: "Hidden film review" }, member.cookie)).status, 404,
          "Moderated films reject new reviews");
        assert.equal((await request(`films/${filmId}/reviews`, "DELETE", {}, member.cookie)).status, 404,
          "Moderated films reject review deletion while hidden");
        assert.equal((await request(`lists/${publicList.body.list.id}`)).body.items.length, 0,
          "Public lists hide moderator-hidden films immediately");
        assert.equal((await fetch(`${base}/api/media/${renderId}`)).status, 404, "A moderated render is no longer public");
        const deniedRepublish = await request(`films/${filmId}/publish`, "POST", { action: "publish" }, owner.cookie);
        assert.equal(deniedRepublish.status, 409);
        assert.match(deniedRepublish.body.error, /moderator/i);
        assert.equal((await request("admin/reports", "POST", { reportId: filmReport.id, action: "restore_film", note: "Reviewed and restored." }, moderationAdmin.cookie)).status, 200);
        assert.equal((await request("discover")).body.films.some(item => item.id === filmId), true);
        assert.equal((await request(`films/${filmId}/reviews`)).body.summary.review_count, 2, "Restoring a film makes its saved reviews visible again");
        assert.equal((await request(`lists/${publicList.body.list.id}`)).body.items.length, 1,
          "Restoring a film makes its list entry visible again");
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
      assert.equal(comment.body.comment.parent_comment_id, null);
      const reply = await request(`films/${filmId}/comments`, "POST", { body: "The movement carries through the cut.", parentCommentId: comment.body.comment.id }, owner.cookie);
      assert.equal(reply.status, 201); assert.equal(reply.body.comment.parent_comment_id, comment.body.comment.id);
      assert.equal((await request(`films/${filmId}/comments`, "POST", { body: "   " }, member.cookie)).status, 400);
      assert.equal((await request(`films/${filmId}/comments`, "POST", { body: "Nested reply", parentCommentId: reply.body.comment.id }, member.cookie)).status, 404,
        "Replies can target root comments only, preserving a bounded thread depth");
      await assert.rejects(
        pool.query(`INSERT INTO comments(id,film_id,author_id,body,parent_comment_id) VALUES($1,$2,$3,'Illegal nested row',$4)`,
          [randomUUID(), filmId, member.body.id, reply.body.comment.id]),
        /Replies must target a top-level comment/,
        "The database trigger also rejects nested replies outside the HTTP API",
      );
      const foreignFilmId = randomUUID();
      await pool.query(
        `INSERT INTO films(id,owner_id,title,premise,genre,duration_minutes,status)
         VALUES($1,$2,'Other public film','A separate film for reply-isolation checks.','Drama',1,'published')`,
        [foreignFilmId, owner.body.id]);
      const foreignRoot = await request(`films/${foreignFilmId}/comments`, "POST", { body: "Comment on a separate film." }, owner.cookie);
      assert.equal(foreignRoot.status, 201);
      assert.equal((await request(`films/${filmId}/comments`, "POST", { body: "Cross-film reply", parentCommentId: foreignRoot.body.comment.id }, member.cookie)).status, 404,
        "Replies cannot cross film boundaries");
      const persistedReply = await pool.query("SELECT parent_comment_id,author_id,body FROM comments WHERE id=$1", [reply.body.comment.id]);
      assert.equal(persistedReply.rowCount, 1); assert.equal(persistedReply.rows[0].parent_comment_id, comment.body.comment.id);
      assert.equal(persistedReply.rows[0].author_id, owner.body.id, "Reply authorship comes from the authenticated session");
      const publicComments = await request(`films/${filmId}/comments`);
      assert.equal(publicComments.body.comments.length, 2);
      assert.equal(publicComments.body.comments[0].id, comment.body.comment.id);
      assert.equal(publicComments.body.comments[1].id, reply.body.comment.id);
      assert.equal(publicComments.body.comments[1].parent_comment_id, comment.body.comment.id);
      await pool.query("DELETE FROM comments WHERE id=$1", [comment.body.comment.id]);
      assert.equal((await pool.query("SELECT 1 FROM comments WHERE id=$1", [reply.body.comment.id])).rowCount, 0,
        "Deleting a root comment cascades its replies");
      assert.equal((await request(`films/${filmId}/comments`, "GET")).body.comments.length, 0);
      const reopenedRoot = await request(`films/${filmId}/comments`, "POST", { body: "Restored test root." }, member.cookie);
      assert.equal(reopenedRoot.status, 201);
      const memberDelete = await request(`films/${filmId}/reviews`, "DELETE", {}, member.cookie);
      assert.equal(memberDelete.status, 200); assert.equal(memberDelete.body.summary.review_count, 1);
      const afterMemberDelete = await request(`films/${filmId}/reviews`);
      assert.equal(afterMemberDelete.body.reviews.length, 1);
      assert.equal(afterMemberDelete.body.reviews[0].id, ownerReview.body.review.id, "A contributor can only remove their own review");
      assert.equal((await request(`films/${filmId}/publish`, "POST", { action: "unpublish" }, owner.cookie)).body.status, "draft");
      assert.equal((await request(`lists/${publicList.body.list.id}`)).body.items.length, 0,
        "Unpublished film list entries are hidden while the film is private");
      assert.equal((await request("discover")).body.films.some(item => item.id === filmId), false);
      assert.equal((await fetch(`${base}/api/media/${renderId}`)).status, 404, "Unpublishing removes public render access");
      assert.equal((await request(`films/${filmId}/comments`)).body.comments.length, 0, "Unpublished films no longer expose comments");
      assert.equal((await request(`films/${filmId}/reviews`)).status, 404, "Unpublished films no longer expose ratings or reviews");
      assert.equal((await request(`films/${filmId}/reviews`, "PUT", { rating: 2, body: "Unpublished film review" }, owner.cookie)).status, 404);
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
