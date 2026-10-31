import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a member saves a film and scene order that persist after reload", async ({ page }, testInfo) => {
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
  await page.getByRole("button", { name: "My profile" }).click();
  await expect(page.getByRole("heading", { name: "CineMesh E2E Member." })).toBeVisible();
  await expect(page.getByText("This filmmaker has not published any films yet.")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
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

  const createShot = async (shotTitle: string, description: string) => {
    const form = page.locator(".shot-block form").last();
    await form.getByLabel("Shot title").fill(shotTitle);
    await form.getByLabel("Shot description").fill(description);
    await form.getByRole("button", { name: "Add my shot contribution" }).click();
  };
  await createShot("Harbor opens", "A lighthouse beam crosses the fog.");
  await createShot("Keeper follows", "The keeper steps into the storm.");
  const timeline = page.getByRole("list", { name: "Scene order" });
  const timelineItems = timeline.getByRole("listitem");
  await expect(timelineItems).toHaveCount(2);
  await expect(timelineItems.nth(0)).toContainText("Harbor opens");
  await expect(timelineItems.nth(1)).toContainText("Keeper follows");
  await timelineItems.nth(1).getByRole("button", { name: "Move Keeper follows up" }).click();
  await expect(timelineItems.nth(0)).toContainText("Keeper follows");
  await expect(timelineItems.nth(1)).toContainText("Harbor opens");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Discover." })).toBeVisible();
  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByLabel("Navigation").selectOption("projects");
  } else {
    await page.getByRole("button", { name: "My projects" }).click();
  }
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("list", { name: "Scene order" }).getByRole("listitem").nth(0)).toContainText("Keeper follows");
  await expect(page.getByRole("list", { name: "Scene order" }).getByRole("listitem").nth(1)).toContainText("Harbor opens");

  await page.getByRole("button", { name: "العربية" }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: testInfo.outputPath("cinemesh-film-studio-rtl.png"), fullPage: true });
});
