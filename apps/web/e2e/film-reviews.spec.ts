import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

test("a published film review persists and can be edited or removed on desktop and mobile", async ({ page }) => {
  const databaseUrl = process.env.CINEMESH_TEST_DATABASE_URL;
  test.skip(!databaseUrl, "Requires the disposable PostgreSQL database used by the CineMesh E2E app");

  const nonce = randomUUID().slice(0, 8);
  const title = `Review ${nonce}`;
  const email = `review-${nonce}@example.test`;
  const password = "disposable-review-password-123";
  const pool = new Pool({ connectionString: databaseUrl });
  let userId = "";
  let filmId = "";
  let mediaPath = "";

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in to create" }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Display name").fill(`Review E2E ${nonce}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password (at least 12 characters)").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("button", { name: "Open notifications" })).toBeVisible();

    const created = await page.evaluate(async ({ title, nonce }) => {
      const me = await fetch("/api/auth/me", { cache: "no-store" }).then(response => response.json());
      const response = await fetch("/api/films", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, premise: `Two shots reveal the same secret ${nonce}.`, genre: "Mystery", duration_minutes: 1 }),
      });
      return { userId: me.user.id, status: response.status, film: await response.json() };
    }, { title, nonce });
    expect(created.status).toBe(201);
    userId = created.userId;
    filmId = created.film.id;

    const storageKey = `${filmId}/renders/${randomUUID()}.mp4`;
    const mediaRoot = path.resolve(process.env.CINEMESH_MEDIA_DIR || path.join(process.cwd(), ".data", "media"));
    mediaPath = path.resolve(mediaRoot, ...storageKey.split("/"));
    const fixture = Buffer.from(`CineMesh review E2E media fixture ${nonce}`);
    await mkdir(path.dirname(mediaPath), { recursive: true });
    await writeFile(mediaPath, fixture, { flag: "wx" });
    await pool.query(
      `INSERT INTO media_assets(id,film_id,kind,storage_key,mime_type,size_bytes,sha256,created_by)
       VALUES($1,$2,'film_render',$3,'video/mp4',$4,$5,$6)`,
      [randomUUID(), filmId, storageKey, fixture.length, createHash("sha256").update(fixture).digest("hex"), userId],
    );
    const published = await page.evaluate(async id => {
      const response = await fetch(`/api/films/${id}/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish" }),
      });
      return { status: response.status, data: await response.json() };
    }, filmId);
    expect(published.status).toBe(200);

    async function openFilm() {
      const card = page.locator(".film-card").filter({ hasText: title });
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: "Film details" }).click();
      await expect(page.getByRole("heading", { name: "Ratings & reviews" })).toBeVisible();
    }

    await page.reload();
    await openFilm();
    await expect(page.locator(".watch-review-summary strong")).toHaveText("0.0");
    await expect(page.getByText("No reviews yet.")).toBeVisible();

    await page.getByRole("button", { name: "Rate 4 stars" }).click();
    await page.getByLabel("Write a review").fill("The second shot makes the reveal feel earned.");
    await page.getByRole("button", { name: "Publish review" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your review is saved." })).toBeVisible();
    await expect(page.locator(".watch-review-summary strong")).toHaveText("4.0");
    const savedReview = await pool.query("SELECT rating,body FROM film_reviews WHERE film_id=$1 AND author_id=$2", [filmId, userId]);
    expect(savedReview.rowCount).toBe(1);
    expect(savedReview.rows[0]).toMatchObject({ rating: 4, body: "The second shot makes the reveal feel earned." });

    await page.reload();
    await openFilm();
    const editor = page.getByLabel("Edit your review");
    await expect(editor).toHaveValue("The second shot makes the reveal feel earned.");
    await expect(page.getByRole("button", { name: "Update review" })).toBeVisible();
    await page.getByRole("button", { name: "Rate 2 stars" }).click();
    await editor.fill("A quieter cut would make the ending clearer.");
    await page.getByRole("button", { name: "Update review" }).click();
    await expect(page.locator(".watch-review-summary strong")).toHaveText("2.0");
    await expect(page.locator(".watch-review-list")).toContainText("A quieter cut would make the ending clearer.");
    const updatedReview = await pool.query("SELECT rating,body FROM film_reviews WHERE film_id=$1 AND author_id=$2", [filmId, userId]);
    expect(updatedReview.rowCount).toBe(1);
    expect(updatedReview.rows[0]).toMatchObject({ rating: 2, body: "A quieter cut would make the ending clearer." });

    await page.reload();
    await openFilm();
    await expect(page.getByLabel("Edit your review")).toHaveValue("A quieter cut would make the ending clearer.");
    await page.getByRole("button", { name: "Delete review" }).click();
    await expect(page.getByText("No reviews yet.")).toBeVisible();
    await expect(page.locator(".watch-review-summary strong")).toHaveText("0.0");
    expect((await pool.query("SELECT 1 FROM film_reviews WHERE film_id=$1 AND author_id=$2", [filmId, userId])).rowCount).toBe(0);
  } finally {
    try {
      if (filmId) await pool.query("DELETE FROM films WHERE id=$1", [filmId]);
      if (userId) await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    }
    finally {
      try { if (mediaPath) await rm(mediaPath, { force: true }); }
      finally { await pool.end(); }
    }
  }
});
