import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a member registers, saves a film, and reopens it after a browser restart", async ({ page }, testInfo) => {
  const title = `Persistence ${randomUUID().slice(0, 8)}`;
  const premise = "A lighthouse keeper follows a blue light through a storm.";

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Discover." })).toBeVisible();
  await page.getByRole("button", { name: "Sign in to create" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill("CineMesh E2E Member");
  await page.getByLabel("Email").fill(`e2e-${randomUUID()}@example.test`);
  await page.getByLabel("Password (at least 12 characters)").fill("disposable-e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByLabel("Navigation").selectOption("discover");
  } else {
    await page.getByRole("button", { name: "Discover" }).click();
  }
  await expect(page.getByRole("heading", { name: "Discover." })).toBeVisible();
  await page.getByRole("button", { name: "Create a film" }).click();
  const form = page.locator("form.create-modal");
  await form.getByLabel("Film title").fill(title);
  await form.getByLabel("Your story idea").fill(premise);
  await form.getByLabel("Genre").fill("Mystery");
  await form.getByRole("button", { name: "Save film" }).click();

  await expect(page.getByRole("heading", { name: `${title}.` })).toBeVisible();
  await expect(page.getByText(premise)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Discover." })).toBeVisible();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByLabel("Navigation").selectOption("projects");
  } else {
    await page.getByRole("button", { name: "My projects" }).click();
  }
  const savedFilm = page.getByRole("button", { name: new RegExp(title) });
  await expect(savedFilm).toBeVisible();
  await savedFilm.click();
  await expect(page.getByRole("heading", { name: `${title}.` })).toBeVisible();
  await expect(page.getByText(premise)).toBeVisible();

  await page.getByRole("button", { name: "العربية" }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: testInfo.outputPath("cinemesh-film-studio-rtl.png"), fullPage: true });
});
