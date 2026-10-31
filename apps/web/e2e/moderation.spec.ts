import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("users can report a member and configured moderators can dismiss it", async ({ page }, testInfo) => {
  const nonce = randomUUID().slice(0, 8);
  const password = "disposable-moderation-password-123";
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in to create" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill(`Report E2E ${nonce}`);
  await page.getByLabel("Email").fill(`reporter-${nonce}@example.test`);
  await page.getByLabel("Password (at least 12 characters)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  const community = page.getByRole("button", { name: "Community", exact: true });
  if (await community.isVisible()) await community.click();
  else await page.locator(".mobile-nav").selectOption("community");
  await page.getByLabel("Search members").fill("CineMesh Test Moderator");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const moderator = page.locator(".community-list .member").filter({ hasText: "CineMesh Test Moderator" });
  await expect(moderator).toHaveCount(1);
  await moderator.locator(".report-control summary").click();
  await moderator.getByLabel("Reason").selectOption("harassment");
  await moderator.getByLabel("Optional details").fill(`Please review this account ${nonce}.`);
  await moderator.getByRole("button", { name: "Submit report" }).click();
  await expect(moderator.getByRole("status")).toContainText("Report submitted");

  const signOut = page.locator("button:visible").filter({ hasText: "Sign out" }).first();
  await signOut.click();
  await page.getByRole("button", { name: "Sign in to create" }).click();
  await page.getByLabel("Email").fill("cinemesh-ci-admin@example.test");
  await page.getByLabel("Password (at least 12 characters)").fill("CineMesh-CI-Admin-Test-Only-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  if (testInfo.project.name === "mobile-chromium") {
    const mobileNav = page.locator(".mobile-nav");
    await expect(mobileNav.locator('option[value="admin"]')).toHaveCount(1);
    await mobileNav.selectOption("admin");
  } else {
    const adminButton = page.getByRole("button", { name: "Admin", exact: true });
    await expect(adminButton).toBeVisible();
    await adminButton.click();
  }
  await expect(page.getByRole("heading", { name: "Admin moderation" })).toBeVisible();
  await expect(page.getByText(`Please review this account ${nonce}.`)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss report" }).click();
  await expect(page.getByText("No reports in this queue.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("cinemesh-admin-moderation.png"), fullPage: true });
});
