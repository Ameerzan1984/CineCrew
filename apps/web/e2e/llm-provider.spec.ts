import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("studio explicitly selects and consents to a synthetic OpenAI API run", async ({ page }) => {
  await page.route("**/api/connections/llm", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { provider: "openai_api", configured: true, verifiedAt: null, vaultReady: true } });
    return route.fulfill({ json: { models: [{ id: "synthetic-model", name: "synthetic-model" }] } });
  });
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/films/*/agents/story-editor", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { id: submitted?.run_id, status: "completed", stage: "production_operator", error_code: null, script_segment: "", output: null } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in to create" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill("LLM consent test");
  await page.getByLabel("Email").fill(`llm-consent-${randomUUID()}@example.test`);
  await page.getByLabel("Password (at least 12 characters)").fill("disposable-llm-consent-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.locator("section").getByRole("button", { name: "Create a film" }).click();
  const form = page.locator("form.create-modal");
  await form.getByLabel("Film title").fill("Synthetic language provider test");
  await form.getByLabel("Your story idea").fill("A lighthouse keeper follows a signal through a storm.");
  await form.getByLabel("Genre").fill("Mystery");
  await form.getByRole("button", { name: "Save film" }).click();
  await page.getByRole("button", { name: "Link to film engine" }).click();
  const studio = page.locator(".cinecrew-agent-run");
  await studio.getByLabel("Language provider").selectOption("openai_api");
  await studio.getByRole("button", { name: "Refresh models" }).click();
  await studio.getByLabel("Model", { exact: true }).selectOption("synthetic-model");
  await studio.getByLabel("Film idea").fill("A lighthouse keeper follows a signal through the storm and finds a lost sailor.");
  const run = studio.getByRole("button", { name: "Write screenplay and run CineCrew" });
  await expect(run).toBeDisabled();
  await studio.getByRole("checkbox").check();
  await expect(run).toBeEnabled();
  await run.click();
  await expect.poll(() => submitted?.provider).toBe("openai_api");
  expect(submitted?.model).toBe("synthetic-model");
  expect(submitted?.llm_cost_consent).toBe(true);
});
