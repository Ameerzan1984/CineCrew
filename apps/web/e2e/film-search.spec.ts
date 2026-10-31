import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

test("Discover searches the published catalog on desktop and mobile", async ({ page }, testInfo) => {
  const databaseUrl = process.env.CINEMESH_TEST_DATABASE_URL;
  test.skip(!databaseUrl, "Requires the disposable PostgreSQL database used by the CineMesh E2E app");

  const nonce = randomUUID().slice(0, 8);
  const title = `Catalog search ${nonce}`;
  const email = `film-search-${nonce}@example.test`;
  const password = "disposable-film-search-password-123";
  const pool = new Pool({ connectionString: databaseUrl });
  let userId = "";
  let filmId = "";
  let mediaPath = "";

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in to create" }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Display name").fill(`Search E2E ${nonce}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password (at least 12 characters)").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("button", { name: "Open notifications" })).toBeVisible();

    const created = await page.evaluate(async ({ title, nonce }) => {
      const me = await fetch("/api/auth/me", { cache: "no-store" }).then(response => response.json());
      const response = await fetch("/api/films", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, premise: `A lighthouse keeper follows a blue light ${nonce}.`, genre: "Mystery", duration_minutes: 1 }),
      });
      return { userId: me.user.id, status: response.status, film: await response.json() };
    }, { title, nonce });
    expect(created.status).toBe(201);
    userId = created.userId;
    filmId = created.film.id;

    const storageKey = `${filmId}/renders/${randomUUID()}.mp4`;
    const mediaRoot = path.resolve(process.env.CINEMESH_MEDIA_DIR || path.join(process.cwd(), ".data", "media"));
    mediaPath = path.resolve(mediaRoot, ...storageKey.split("/"));
    const fixture = Buffer.from(`CineMesh search E2E media fixture ${nonce}`);
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
      return response.status;
    }, filmId);
    expect(published).toBe(200);

    await page.reload();
    const search = page.getByRole("searchbox", { name: "Search published films" });
    await search.fill(title);
    await expect(page.locator(".discover-film-card").filter({ hasText: title })).toBeVisible();
    await search.fill(`no-match-${nonce}`);
    await expect(page.getByText("No published films match your search.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("cinemesh-discover-search.png"), fullPage: true });
  } finally {
    try {
      if (filmId) await pool.query("DELETE FROM films WHERE id=$1", [filmId]);
      if (userId) await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    } finally {
      try { if (mediaPath) await rm(mediaPath, { force: true }); }
      finally { await pool.end(); }
    }
  }
});
