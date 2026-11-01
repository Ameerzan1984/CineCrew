import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Connections searches and shows synthetic MCP tool schemas", async ({ page }, testInfo) => {
  const tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = Array.from(
    { length: 9 }, (_, index) => ({ name: `image_tool_${index}`, description: "Image tool", inputSchema: { type: "object" } }),
  );
  tools.push({ name: "text_example", description: "Synthetic script tool", inputSchema: { type: "object", properties: { prompt: { type: "string" } } } });
  await page.route("**/api/connections", route => route.fulfill({ json: {
    api: { configured: false, verified: false, verifiedAt: null },
    mcp: { available: true, connected: true, verifiedAt: new Date().toISOString(), tools,
      videoGeneration: { advertised: false, toolName: null, schemaHasParameters: false, fields: [], paramsFields: [], executable: false, reason: "Synthetic test metadata" },
      reason: "Synthetic MCP connection for interface testing" },
    models: [], jobs: [], usage: null, balance: null,
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in to create" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill("MCP catalog test");
  await page.getByLabel("Email").fill(`mcp-catalog-${randomUUID()}@example.test`);
  await page.getByLabel("Password (at least 12 characters)").fill("disposable-mcp-catalog-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open notifications" })).toBeVisible();
  if (testInfo.project.name.startsWith("mobile")) await page.getByLabel("Navigation").selectOption("settings");
  else await page.getByRole("button", { name: "Connections" }).click();

  await expect(page.getByRole("heading", { name: "How CineMesh connections fit together" })).toBeVisible();
  await expect(page.getByText("MCP video submission is not enabled", { exact: false })).toBeVisible();
  await page.getByText("Browse MCP tools and input schemas").click();
  await page.getByRole("searchbox", { name: "Search tool names and descriptions" }).fill("script");
  await page.getByText("text_example", { exact: true }).click();
  await expect(page.locator(".mcp-catalog pre")).toContainText('"prompt"');
  await expect(page.getByText("A listing does not verify model access, price, or permission to execute.", { exact: false })).toBeVisible();
});
