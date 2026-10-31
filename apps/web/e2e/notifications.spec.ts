import { randomUUID } from "node:crypto";
import { expect, request, test } from "@playwright/test";

test("collaborator receives and acts on a persistent film invitation notification", async ({ page }, testInfo) => {
  const baseURL = process.env.CINEMESH_TEST_URL || "http://127.0.0.1:3000";
  const recipientEmail = `notification-${randomUUID()}@example.test`;
  const title = `Invite ${randomUUID().slice(0, 8)}`;
  const password = "disposable-notification-password-123";

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in to create" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill("Notification E2E Recipient");
  await page.getByLabel("Email").fill(recipientEmail);
  await page.getByLabel("Password (at least 12 characters)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open notifications" })).toBeVisible();

  const ownerApi = await request.newContext({ baseURL });
  try {
    const headers = { Origin: baseURL };
    const owner = await ownerApi.post("/api/auth/register", {
      headers,
      data: { name: "Notification E2E Owner", email: `owner-${randomUUID()}@example.test`, password },
    });
    expect(owner.status()).toBe(201);
    const film = await ownerApi.post("/api/films", {
      headers,
      data: { title, premise: "Two filmmakers continue the same story.", genre: "Drama", duration_minutes: 1, mode: "collaborative" },
    });
    expect(film.status()).toBe(201);
    const filmData = await film.json();
    const invitation = await ownerApi.post(`/api/films/${filmData.id}/collaborators`, {
      headers,
      data: { action: "invite", email: recipientEmail, role: "editor" },
    });
    expect(invitation.status()).toBe(201);

    await page.getByRole("button", { name: "Open notifications" }).click();
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText(/Notification E2E Owner invited you as editor/)).toBeVisible();
    await page.getByRole("button", { name: "Mark as read" }).click();
    await expect(page.locator(".notification-count")).toHaveCount(0);
    await page.getByRole("button", { name: "View invitations" }).click();
    await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("No pending invitations.")).toBeVisible();

    const ownerNotifications = await ownerApi.get("/api/notifications");
    expect(ownerNotifications.status()).toBe(200);
    const ownerInbox = await ownerNotifications.json();
    expect(ownerInbox.notifications[0].notification_type).toBe("invitation_accepted");
    expect(ownerInbox.notifications[0].actor_display_name).toBe("Notification E2E Recipient");
  } finally {
    await ownerApi.dispose();
  }

  await page.screenshot({ path: testInfo.outputPath("cinemesh-notifications.png"), fullPage: true });
});
