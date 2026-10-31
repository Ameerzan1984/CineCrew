import test from "node:test";
import assert from "node:assert/strict";
import { filterMcpTools } from "../lib/mcp-tool-catalog.ts";

test("MCP catalog searches only the supplied account tool names and descriptions", () => {
  const tools = [
    { name: "generate_image", description: "Create a portrait", inputSchema: null },
    { name: "text_task", description: "Analyze a script", inputSchema: { type: "object" } },
  ];
  assert.deepEqual(filterMcpTools(tools, "  SCRIPT  "), [tools[1]]);
  assert.deepEqual(filterMcpTools(tools, "IMAGE"), [tools[0]]);
  assert.deepEqual(filterMcpTools(tools, "no-such-tool"), []);
  assert.deepEqual(filterMcpTools(tools, "  "), tools);
});
