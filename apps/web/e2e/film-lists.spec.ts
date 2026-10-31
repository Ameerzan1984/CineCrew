import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

test("a member creates a public list and saves a published film across reloads", async ({ page }, testInfo) => {
  const databaseUrl = process.env.CINEMESH_TEST_DATABASE_URL;
  test.skip(!databaseUrl, "Requires the disposable PostgreSQL database used by the CineMesh E2E app");

  const nonce = randomUUID().slice(0, 8);
  const title = `List feature ${nonce}`;
  const listName = `Night films ${nonce}`;
  const email = `film-lists-${nonce}@example.test`;
  const password = "disposable-film-lists-password-123";
  const pool = new Pool({ connectionString: databaseUrl });
  let userId = "";
  let filmId = "";
  let mediaPath = "";

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in to create" }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Display name").fill(`Lists E2E ${nonce}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password (at least 12 characters)").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("button", { name: "Open notifications" })).toBeVisible();

    const created = await page.evaluate(async ({ title, nonce }) => {
      const me = await fetch("/api/auth/me", { cache: "no-store" }).then(response => response.json());
      const response = await fetch("/api/films", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, premise: `A night projectionist follows a light through the archive ${nonce}.`, genre: "Mystery", duration_minutes: 1 }),
      });
      return { userId: me.user.id, status: response.status, film: await response.json() };
    }, { title, nonce });
    expect(created.status).toBe(201);
    userId = created.userId;
    filmId = created.film.id;

    const storageKey = `${filmId}/renders/${randomUUID()}.mp4`;
    const mediaRoot = path.resolve(process.env.CINEMESH_MEDIA_DIR || path.join(process.cwd(), ".data", "media"));
    mediaPath = path.resolve(mediaRoot, ...storageKey.split("/"));
    const fixture = Buffer.from(`CineMesh film-list E2E media fixture ${nonce}`);
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

    async function navigate(pageName: string, desktopLabel: string) {
      if (testInfo.project.name.startsWith("mobile")) {
        await page.getByLabel("Navigation").selectOption(pageName);
      } else {
        await page.getByRole("button", { name: desktopLabel }).click();
      }
    }

    await navigate("lists", "Film lists");
    await expect(page.getByRole("heading", { name: "Film lists." })).toBeVisible();
    await page.locator(".film-list-create").getByLabel("List name").fill(listName);
    await page.locator(".film-list-create").getByLabel("Optional description").fill("A small set of nocturnal stories.");
    await page.locator(".film-list-create").getByLabel("Visibility").selectOption("public");
    await page.getByRole("button", { name: "Create a list" }).click();
    await expect(page.getByRole("status").filter({ hasText: "List saved." })).toBeVisible();
    await expect(page.locator(".film-list-public")).toContainText(listName);

    await navigate("discover", "Discover");
    const card = page.locator(".discover-film-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Film details" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByLabel("Choose a list").selectOption({ label: `${listName} (public)` });
    await page.getByRole("button", { name: "Add to list" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Film saved to your list." })).toBeVisible();

    const savedItem = await pool.query(
      `SELECT li.list_id,li.film_id,l.owner_id,l.visibility
       FROM film_list_items li JOIN film_lists l ON l.id=li.list_id
       WHERE li.film_id=$1 AND l.name=$2`, [filmId, listName],
    );
    expect(savedItem.rowCount).toBe(1);
    expect(savedItem.rows[0]).toMatchObject({ film_id: filmId, owner_id: userId, visibility: "public" });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Discover." })).toBeVisible();
    await navigate("lists", "Film lists");
    await page.locator(".film-list-create .film-list-card").filter({ hasText: listName }).locator(".film-list-open").click();
    await expect(page.locator(".film-list-detail")).toContainText(title);
    await expect(page.locator(".film-list-detail")).toContainText("1 films");
    await page.reload();
    await navigate("lists", "Film lists");
    await page.locator(".film-list-create .film-list-card").filter({ hasText: listName }).locator(".film-list-open").click();
    await expect(page.locator(".film-list-detail")).toContainText(title);
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
