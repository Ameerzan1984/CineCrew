import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../lib/db";
import { allowedOrigin } from "../../../lib/origin";
import { createSession, currentUser, deleteSession, hashPassword, verifyPassword } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const error = (message: string, status: number) => json({ error: message }, status);
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function body(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 2_000_000) throw new Error("Request too large");
  return JSON.parse(raw);
}
async function engine(path: string, init: RequestInit = {}) {
  if (!process.env.FILM_ENGINE_URL || !process.env.FILM_ENGINE_SERVICE_TOKEN) throw new Error("Film engine is not configured");
  const result = await fetch(`${process.env.FILM_ENGINE_URL.replace(/\/$/, "")}${path}`, { ...init, headers: { "Content-Type": "application/json", "X-Cinemesh-Service-Token": process.env.FILM_ENGINE_SERVICE_TOKEN }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!result.ok) throw new Error(`Film engine returned ${result.status}`);
  return result.json();
}
async function handle(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path;
  const method = request.method;
  // State-changing requests must originate from this application; the cookie is also SameSite=Strict.
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (!allowedOrigin(origin, request.nextUrl.origin)) return error("Invalid request origin", 403);
  }
  try {
    const db = database();
    if (path[0] === "auth" && method === "POST") {
      if (path[1] === "logout") { await deleteSession(); return json({ ok: true }); }
      if (!["register", "login"].includes(path[1])) return error("Not found", 404);
      const input = await body(request);
      const email = text(input.email, 254).toLowerCase();
      const password = typeof input.password === "string" ? input.password : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256) return error("Enter a valid email and a password of 12–256 characters", 400);
      if (path[1] === "register") {
        const name = text(input.name, 80);
        if (!name) return error("Enter a display name", 400);
        const id = randomUUID();
        try { await db.query("INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)", [id,email,name,await hashPassword(password)]); }
        catch (e) { if ((e as {code?: string}).code === "23505") return error("Account already exists", 409); throw e; }
        await createSession(id); return json({ id, email, display_name: name }, 201);
      }
      const client = await db.connect();
      let loginUser;
      try {
        await client.query("BEGIN");
        // Serialize attempts for the same email across all app instances.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
        const attempts = await client.query("SELECT count(*)::int AS n FROM login_attempts WHERE email=$1 AND attempted_at>now()-interval '15 minutes'", [email]);
        if (attempts.rows[0].n >= 10) { await client.query("COMMIT"); return error("Too many attempts; try again later", 429); }
        const found = await client.query("SELECT id,email,display_name,password_hash FROM users WHERE email=$1", [email]);
        const valid = await verifyPassword(password, found.rows[0]?.password_hash ?? "00000000000000000000000000000000:" + "0".repeat(128));
        if (!valid || !found.rows[0]) { await client.query("INSERT INTO login_attempts(email) VALUES($1)", [email]); await client.query("COMMIT"); return error("Invalid email or password", 401); }
        await client.query("DELETE FROM login_attempts WHERE email=$1", [email]);
        loginUser = found.rows[0];
        await client.query("COMMIT");
      } catch (e) { await client.query("ROLLBACK"); throw e; }
      finally { client.release(); }
      await createSession(loginUser.id);
      const { password_hash: _hash, ...safeUser } = loginUser; return json(safeUser);
    }
    const user = await currentUser();
    if (path[0] === "auth" && path[1] === "me" && method === "GET") return json({ user });
    if (path[0] === "profiles" && path[1] && uuid.test(path[1]) && path.length === 2 && method === "GET") {
      const profileResult = await db.query(
        `SELECT u.id,u.display_name,
                (SELECT count(*)::integer FROM follows f WHERE f.followed_id=u.id) AS followers,
                (SELECT count(*)::integer FROM follows f WHERE f.follower_id=u.id) AS following_count,
                CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS (
                  SELECT 1 FROM follows own WHERE own.follower_id=$2 AND own.followed_id=u.id
                ) END AS following
         FROM users u WHERE u.id=$1`, [path[1], user?.id ?? null]);
      if (!profileResult.rows[0]) return error("Profile not found", 404);
      const filmsResult = await db.query(
        `SELECT f.id,f.title,f.premise,f.genre,f.duration_minutes,f.language,
                render.id AS media_asset_id,render.size_bytes AS media_size_bytes,
                (SELECT count(*)::integer FROM film_likes l WHERE l.film_id=f.id) AS likes_count,
                (SELECT count(*)::integer FROM comments c WHERE c.film_id=f.id) AS comments_count,
                CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS (
                  SELECT 1 FROM film_likes own_like WHERE own_like.film_id=f.id AND own_like.user_id=$2
                ) END AS liked_by_me
         FROM films f
         JOIN LATERAL (
           SELECT a.id,a.size_bytes FROM media_assets a
           WHERE a.film_id=f.id AND a.kind='film_render'
           ORDER BY a.created_at DESC,a.id DESC LIMIT 1
         ) render ON true
         WHERE f.owner_id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL
         ORDER BY f.updated_at DESC,f.id DESC LIMIT 60`, [path[1], user?.id ?? null]);
      return json({ profile: profileResult.rows[0], films: filmsResult.rows });
    }
    if (path[0] === "watch" && path[1] && uuid.test(path[1]) && path.length === 2 && method === "GET") {
      const filmResult = await db.query(
        `SELECT f.id,f.owner_id,f.title,f.premise,f.genre,f.duration_minutes,f.language,
                owner.display_name AS owner_display_name,
                render.id AS media_asset_id,render.size_bytes AS media_size_bytes,
                (SELECT count(*)::integer FROM film_likes l WHERE l.film_id=f.id) AS likes_count,
                (SELECT count(*)::integer FROM comments c WHERE c.film_id=f.id) AS comments_count,
                CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS (
                  SELECT 1 FROM film_likes own_like WHERE own_like.film_id=f.id AND own_like.user_id=$2
                ) END AS liked_by_me
         FROM films f JOIN users owner ON owner.id=f.owner_id
         JOIN LATERAL (
           SELECT a.id,a.size_bytes FROM media_assets a
           WHERE a.film_id=f.id AND a.kind='film_render'
           ORDER BY a.created_at DESC,a.id DESC LIMIT 1
         ) render ON true
         WHERE f.id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL`, [path[1], user?.id ?? null]);
      if (!filmResult.rows[0]) return error("Film not found", 404);
      const credits = await db.query(
        `SELECT owner.id AS user_id,owner.display_name,'director'::text AS role
         FROM films f JOIN users owner ON owner.id=f.owner_id WHERE f.id=$1
         UNION ALL
         SELECT u.id AS user_id,u.display_name,c.role::text AS role
         FROM film_contributors c JOIN users u ON u.id=c.user_id JOIN films f ON f.id=c.film_id
         WHERE f.id=$1 AND c.user_id<>f.owner_id
         ORDER BY role,user_id`, [path[1]]);
      return json({ film: filmResult.rows[0], contributors: credits.rows });
    }
    if (path[0] === "films" && path[1] && uuid.test(path[1]) && path[2] === "comments" && path.length === 3 && method === "GET") {
      const result = await db.query(
        `SELECT c.id,c.body,c.created_at,c.parent_comment_id,u.display_name AS author_display_name
         FROM comments c
         JOIN films f ON f.id=c.film_id
         JOIN users u ON u.id=c.author_id
         LEFT JOIN comments parent ON parent.id=c.parent_comment_id
         WHERE c.film_id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL
         ORDER BY COALESCE(parent.created_at,c.created_at), COALESCE(parent.id,c.id),
                  (c.parent_comment_id IS NOT NULL), c.created_at, c.id
         LIMIT 300`, [path[1]]);
      return json({ comments: result.rows });
    }
    if (path[0] === "films" && path[1] && uuid.test(path[1]) && path[2] === "reviews" && path.length === 3 && method === "GET") {
      const [summary, reviews, mine] = await Promise.all([
        db.query(
          `SELECT COALESCE(ROUND(AVG(r.rating)::numeric,1),0)::float AS average_rating,
                  count(r.id)::integer AS review_count
           FROM films f LEFT JOIN film_reviews r ON r.film_id=f.id
           WHERE f.id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL
           GROUP BY f.id`, [path[1]]),
        db.query(
          `SELECT r.id,r.rating,r.body,r.created_at,r.updated_at,u.display_name AS author_display_name,
                  ($2::uuid IS NOT NULL AND r.author_id=$2) AS is_own
           FROM film_reviews r
           JOIN films f ON f.id=r.film_id
           JOIN users u ON u.id=r.author_id
           WHERE r.film_id=$1 AND f.status='published' AND f.moderation_hidden_at IS NULL
           ORDER BY r.created_at DESC,r.id DESC
           LIMIT 100`, [path[1], user?.id ?? null]),
        user ? db.query(
          `SELECT r.id,r.rating,r.body,r.created_at,r.updated_at,u.display_name AS author_display_name,true AS is_own
           FROM film_reviews r JOIN films f ON f.id=r.film_id JOIN users u ON u.id=r.author_id
           WHERE r.film_id=$1 AND r.author_id=$2 AND f.status='published' AND f.moderation_hidden_at IS NULL`,
          [path[1], user.id]) : Promise.resolve({ rows: [] }),
      ]);
      if (!summary.rows[0]) return error("Film not found", 404);
      return json({ summary: summary.rows[0], reviews: reviews.rows, my_review: mine.rows[0] ?? null });
    }
    if (!user) return error("Sign in required", 401);
    if (path[0] === "films" && path[1] && uuid.test(path[1]) && path[2] === "likes" && path.length === 3 && ["POST", "DELETE"].includes(method)) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const film = await client.query("SELECT id FROM films WHERE id=$1 AND status='published' AND moderation_hidden_at IS NULL FOR UPDATE", [path[1]]);
        if (!film.rows[0]) { await client.query("ROLLBACK"); return error("Film not found", 404); }
        if (method === "POST") await client.query("INSERT INTO film_likes(film_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [path[1], user.id]);
        else await client.query("DELETE FROM film_likes WHERE film_id=$1 AND user_id=$2", [path[1], user.id]);
        const result = await client.query(
          `SELECT count(*)::integer AS likes_count,
                  EXISTS(SELECT 1 FROM film_likes WHERE film_id=$1 AND user_id=$2) AS liked_by_me
           FROM film_likes WHERE film_id=$1`, [path[1], user.id]);
        await client.query("COMMIT");
        return json(result.rows[0]);
      } catch (e) { await client.query("ROLLBACK"); throw e; }
      finally { client.release(); }
    }
    if (path[0] === "films" && path[1] && uuid.test(path[1]) && path[2] === "comments" && path.length === 3 && method === "POST") {
      const input = await body(request);
      const comment = text(input.body, 2000);
      if (!comment) return error("Comment text is required (up to 2,000 characters)", 400);
      const parentCommentId = input.parentCommentId == null ? null : input.parentCommentId;
      if (parentCommentId !== null && (typeof parentCommentId !== "string" || !uuid.test(parentCommentId))) {
        return error("Reply target is invalid", 400);
      }
      const result = await db.query(
        `INSERT INTO comments(id,film_id,author_id,body,parent_comment_id)
         SELECT $1,f.id,$3,$4,p.id FROM films f
         LEFT JOIN comments p ON p.id=$5::uuid AND p.film_id=f.id AND p.parent_comment_id IS NULL
         WHERE f.id=$2 AND f.status='published' AND f.moderation_hidden_at IS NULL
           AND ($5::uuid IS NULL OR p.id IS NOT NULL)
         RETURNING id,body,created_at,parent_comment_id`, [randomUUID(), path[1], user.id, comment, parentCommentId]);
      if (!result.rows[0]) return error("Film or reply target was not found", 404);
      return json({ comment: { ...result.rows[0], author_display_name: user.display_name } }, 201);
    }
    if (path[0] === "films" && path[1] && uuid.test(path[1]) && path[2] === "reviews" && path.length === 3 && method === "PUT") {
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) return error("Invalid review", 400);
      const rating = input.rating;
      const reviewBody = typeof input.body === "string" ? input.body.trim() : "";
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return error("Choose a rating from 1 to 5", 400);
      if (!reviewBody || reviewBody.length > 4000) return error("Review text is required (up to 4,000 characters)", 400);
      const result = await db.query(
        `INSERT INTO film_reviews(id,film_id,author_id,rating,body)
         SELECT $1,f.id,$3,$4,$5 FROM films f
         WHERE f.id=$2 AND f.status='published' AND f.moderation_hidden_at IS NULL
         ON CONFLICT (film_id,author_id) DO UPDATE
           SET rating=EXCLUDED.rating,body=EXCLUDED.body,updated_at=now()
         RETURNING id,rating,body,created_at,updated_at`,
        [randomUUID(), path[1], user.id, rating, reviewBody]);
      if (!result.rows[0]) return error("Film not found", 404);
      const summary = await db.query(
        `SELECT ROUND(AVG(rating)::numeric,1)::float AS average_rating,count(*)::integer AS review_count
         FROM film_reviews WHERE film_id=$1`, [path[1]]);
      return json({
        review: { ...result.rows[0], author_display_name: user.display_name, is_own: true },
        summary: summary.rows[0],
      });
    }
    if (path[0] === "films" && path[1] && uuid.test(path[1]) && path[2] === "reviews" && path.length === 3 && method === "DELETE") {
      const deleted = await db.query(
        `DELETE FROM film_reviews r USING films f
         WHERE r.film_id=f.id AND f.id=$1 AND r.author_id=$2
           AND f.status='published' AND f.moderation_hidden_at IS NULL
         RETURNING r.id`, [path[1], user.id]);
      if (!deleted.rowCount) return error("Film or your review was not found", 404);
      const summary = await db.query(
        `SELECT COALESCE(ROUND(AVG(rating)::numeric,1),0)::float AS average_rating,
                count(*)::integer AS review_count
         FROM film_reviews WHERE film_id=$1`, [path[1]]);
      return json({ deleted: true, summary: summary.rows[0] });
    }
    if (path[0] === "films" && path.length === 1) {
      if (method === "GET") {
        const result = await db.query(
          `SELECT f.id,f.title,f.premise,f.genre,f.duration_minutes,f.language,f.visual_style,f.mode,f.status,f.engine_film_id,f.updated_at,
                  CASE WHEN f.owner_id=$1 THEN 'owner' ELSE c.role END AS my_role,
                  owner.display_name AS owner_display_name
           FROM films f JOIN users owner ON owner.id=f.owner_id
           LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$1
           WHERE f.owner_id=$1 OR c.user_id=$1
           ORDER BY f.updated_at DESC`, [user.id]);
        return json({ films: result.rows });
      }
      if (method === "POST") {
        const input = await body(request);
        const title = text(input.title, 160), premise = text(input.premise, 4000), genre = text(input.genre, 80);
        const minutes = Number(input.duration_minutes), language = input.language === "ar" ? "ar" : "en";
        if (!title || !premise || !genre || !Number.isInteger(minutes) || minutes < 1 || minutes > 120) return error("Title, idea, genre and duration (1–120 minutes) are required", 400);
        const result = await db.query("INSERT INTO films(id,owner_id,title,premise,genre,duration_minutes,language,visual_style,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,title,premise,genre,duration_minutes,language,visual_style,mode,status,engine_film_id,updated_at", [randomUUID(),user.id,title,premise,genre,minutes,language,text(input.visual_style,160),input.mode === "collaborative" ? "collaborative" : "automatic"]);
        return json(result.rows[0],201);
      }
    }
    if (path[0] === "films" && path[1] && uuid.test(path[1])) {
      const result = await db.query(
        `SELECT f.id,f.title,f.premise,f.genre,f.duration_minutes,f.language,f.visual_style,f.mode,f.status,f.engine_film_id,f.updated_at,
                CASE WHEN f.owner_id=$2 THEN 'owner' ELSE c.role END AS my_role,
                owner.display_name AS owner_display_name
         FROM films f JOIN users owner ON owner.id=f.owner_id
         LEFT JOIN film_contributors c ON c.film_id=f.id AND c.user_id=$2
         WHERE f.id=$1 AND (f.owner_id=$2 OR c.user_id=$2)`, [path[1],user.id]);
      const film = result.rows[0];
      if (!film) return error("Film not found",404);
      if (path.length === 2 && method === "GET") return json(film);
      if (path[2] === "engine" && path[3] === "connect" && method === "POST") {
        if (film.my_role !== "owner") return error("Film not found",404);
        // Serialize simultaneous link attempts for this film. External creation cannot
        // be atomic with PostgreSQL; uncertain network outcomes require reconciliation.
        const client = await db.connect();
        try {
          await client.query("BEGIN");
          const locked = await client.query("SELECT engine_film_id FROM films WHERE id=$1 AND owner_id=$2 FOR UPDATE", [film.id,user.id]);
          if (!locked.rows[0].engine_film_id) {
            const created = await engine("/films", { method: "POST", body: JSON.stringify({ title: film.title, premise: film.premise, genre: film.genre, duration_minutes: film.duration_minutes, language: film.language, visual_style: film.visual_style || "Cinematic", mode: film.mode }) });
            if (typeof created.id !== "string") throw new Error("Film engine returned an invalid ID");
            await client.query("UPDATE films SET engine_film_id=$1,updated_at=now() WHERE id=$2 AND owner_id=$3", [created.id,film.id,user.id]);
          }
          await client.query("COMMIT");
          return json({ connected: true });
        } catch (e) { await client.query("ROLLBACK"); throw e; }
        finally { client.release(); }
      }
      if (path[2] === "engine" && path[3] === "checkpoints" && method === "GET") {
        if (!film.engine_film_id) return error("Film is not linked to the engine",409);
        return json(await engine(`/films/${encodeURIComponent(film.engine_film_id)}/checkpoints`));
      }
      if (path[2] === "engine" && ["filmdsl", "production-plan"].includes(path[3])) {
        if (!film.engine_film_id) return error("Film is not linked to the engine",409);
        const remotePath = `/films/${encodeURIComponent(film.engine_film_id)}/${path[3]}`;
        if (method === "GET") return json(await engine(remotePath));
        if (film.my_role !== "owner") return error("Film not found",404);
        if ((path[3] === "filmdsl" && method === "PUT") || (path[3] === "production-plan" && method === "POST")) {
          const payload = await body(request);
          if (!payload || typeof payload !== "object" || Array.isArray(payload)) return error("Expected a JSON object", 400);
          return json(await engine(remotePath, { method, body: JSON.stringify(payload) }));
        }
      }
      if (path[2] === "engine" && path[3] === "advance" && method === "POST") {
        if (film.my_role !== "owner") return error("Film not found",404);
        if (!film.engine_film_id) return error("Film is not linked to the engine",409);
        const input = await body(request);
        if (typeof input.idempotency_key !== "string" || !uuid.test(input.idempotency_key)) return error("A valid idempotency key is required",400);
        return json(await engine(`/films/${encodeURIComponent(film.engine_film_id)}/advance`, { method: "POST", body: JSON.stringify({ idempotency_key: input.idempotency_key }) }));
      }
    }
    return error("Not found",404);
  } catch (e) {
    if (e instanceof SyntaxError) return error("Invalid JSON",400);
    console.error("CineMesh request failed:", e instanceof Error ? e.message : "unknown error");
    return error("The service is unavailable or the request could not be completed",503);
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
