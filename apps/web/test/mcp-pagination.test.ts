import test from "node:test";
import assert from "node:assert/strict";
import { collectHiggsfieldMcpTools } from "../lib/higgsfield-mcp-oauth.ts";

test("MCP discovery follows tool cursors and retains bounded schemas", async () => {
  const seen: Array<string | undefined> = [];
  const tools = await collectHiggsfieldMcpTools(async cursor => {
    seen.push(cursor);
    return cursor
      ? { tools: [{ name: "text_task", inputSchema: { type: "object" } }] }
      : { tools: [{ name: "image_task", description: "image", inputSchema: { type: "object" } }], nextCursor: "next" };
  });
  assert.deepEqual(seen, [undefined, "next"]);
  assert.deepEqual(tools.map(tool => tool.name), ["image_task", "text_task"]);
  assert.deepEqual(tools[1].inputSchema, { type: "object" });
});

test("MCP discovery rejects repeated cursors, duplicate names and excessive pages", async () => {
  await assert.rejects(() => collectHiggsfieldMcpTools(async cursor => ({
    tools: [{ name: cursor ? "second" : "first" }], nextCursor: "same",
  })), /repeated a cursor/);
  await assert.rejects(() => collectHiggsfieldMcpTools(async cursor => ({
    tools: [{ name: "duplicate" }], ...(cursor ? {} : { nextCursor: "next" }),
  })), /duplicate MCP tool/);
  let page = 0;
  await assert.rejects(() => collectHiggsfieldMcpTools(async () => ({
    tools: [], nextCursor: String(++page),
  })), /page limit/);
});
