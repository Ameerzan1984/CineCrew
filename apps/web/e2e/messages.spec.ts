import { randomUUID } from "node:crypto";
import { expect, request, test } from "@playwright/test";

test("filmmakers can exchange a private message from Community and see unread state", async ({ page }, testInfo) => {
  const baseURL = process.env.CINEMESH_TEST_URL || "http://127.0.0.1:3000";
  const suffix = randomUUID().slice(0, 8);
  const recipientName = `Private E2E ${suffix}`;
  const senderEmail = `sender-${suffix}@example.test`;
  const password = "disposable-private-message-password-123";
  const message = `Production note ${suffix}`;
  const recipientApi = await request.newContext({ baseURL });

  try {
    const recipient = await recipientApi.post("/api/auth/register", {
      headers: { Origin: baseURL },
      data: { name: recipientName, email: `recipient-${suffix}@example.test`, password },
    });
    expect(recipient.status()).toBe(201);

    await page.goto("/");
    await page.getByRole("button", { name: "Sign in to create" }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Display name").fill(`Private Sender ${suffix}`);
    await page.getByLabel("Email").fill(senderEmail);
    await page.getByLabel("Password (at least 12 characters)").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    const communityButton = page.getByRole("button", { name: "Community", exact: true });
    if (await communityButton.isVisible()) await communityButton.click();
    else await page.locator(".mobile-nav").selectOption("community");
    await page.getByLabel("Search members").fill(recipientName);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const recipientCard = page.locator(".community-list .member").filter({ hasText: recipientName });
    await expect(recipientCard).toHaveCount(1);
    await recipientCard.getByRole("button", { name: "Message", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Messages/ })).toBeVisible();
    await page.getByLabel("Your message").fill(message);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();

    const inbox = await recipientApi.get("/api/messages");
    expect(inbox.status()).toBe(200);
    const data = await inbox.json();
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0].other_display_name).toContain("Private Sender");
    expect(data.conversations[0].last_message).toBe(message);
    expect(data.conversations[0].unread_count).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("cinemesh-private-messages.png"), fullPage: true });
  } finally {
    await recipientApi.dispose();
  }
});
