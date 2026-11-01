import test from "node:test";
import assert from "node:assert/strict";
import { HiggsfieldMcpGenerationProvider, type HiggsfieldMcpCatalog, type McpCandidate } from "../lib/higgsfield-mcp-generation.ts";

const schema = {
  type: "object",
  properties: {
    params: {
      anyOf: [{
        type: "object",
        properties: { model: { type: "string", enum: ["synthetic-model"] }, prompt: { type: "string", minLength: 1 }, duration: { type: "integer", minimum: 1 } },
        required: ["model", "prompt"], additionalProperties: false,
      }],
    },
  },
  required: ["params"], additionalProperties: false,
};

function fixture(): { catalog: HiggsfieldMcpCatalog; candidate: McpCandidate } {
  return {
    catalog: { ownerId: "contributor-a", verifiedAt: "2026-01-01T00:00:00Z", accessExpiresAt: null,
      tools: [{ name: "synthetic_video_tool", description: null, inputSchema: schema }] },
    candidate: { actorId: "contributor-a", filmId: "film-a", shotId: "shot-a", toolName: "synthetic_video_tool",
      arguments: { params: { model: "synthetic-model", prompt: "private test prompt", duration: 3 } } },
  };
}

test("MCP preflight validates the selected discovered schema but never authorizes spend or dispatch", () => {
  const { catalog, candidate } = fixture();
  const provider = new HiggsfieldMcpGenerationProvider(catalog);
  const inspected = provider.inspect(candidate);
  assert.equal(inspected.schemaValidation, "valid");
  assert.equal(inspected.canSubmit, false);
  assert.equal(inspected.estimatedCredits, null);
  assert.ok(inspected.blockers.includes("provider_confirmation_contract_unverified"));
  assert.equal(JSON.stringify(inspected).includes("private test prompt"), false);
  assert.throws(() => provider.submit(), /generation is disabled/);

  const invalid = provider.inspect({ ...candidate, arguments: { params: { model: "synthetic-model", duration: 3 } } });
  assert.equal(invalid.schemaValidation, "invalid");
  assert.equal(invalid.canSubmit, false);
  assert.equal(provider.inspect({ ...candidate, arguments: { params: { model: "unknown", prompt: "x" } } }).schemaValidation, "invalid");
  assert.equal(provider.inspect({ ...candidate, arguments: { params: { model: "synthetic-model", prompt: "x".repeat(4097) } } }).schemaValidation, "invalid");
});

test("MCP inspection isolates account metadata and rejects missing, opaque or unsafe schemas", () => {
  const { catalog, candidate } = fixture();
  const provider = new HiggsfieldMcpGenerationProvider(catalog);
  assert.equal(provider.inspect({ ...candidate, actorId: "contributor-b" }).schemaValidation, "unavailable");
  assert.equal(provider.inspect({ ...candidate, toolName: "unlisted" }).schemaValidation, "unavailable");
  assert.equal(new HiggsfieldMcpGenerationProvider({ ...catalog, verifiedAt: null }).inspect(candidate).schemaValidation, "unavailable");
  assert.equal(new HiggsfieldMcpGenerationProvider({ ...catalog, accessExpiresAt: 1 }).inspect(candidate, 2).schemaValidation, "unavailable");
  assert.equal(new HiggsfieldMcpGenerationProvider({ ...catalog, tools: [...catalog.tools, ...catalog.tools] }).inspect(candidate).schemaValidation, "unavailable");
  const withSchema = (inputSchema: Record<string, unknown> | null) =>
    new HiggsfieldMcpGenerationProvider({ ...catalog, tools: [{ ...catalog.tools[0], inputSchema }] }).inspect(candidate);
  assert.equal(withSchema(null).schemaValidation, "unavailable");
  assert.equal(withSchema({ type: "object" }).schemaValidation, "unavailable");
  assert.equal(withSchema({ type: "object", anyOf: [{}] }).schemaValidation, "unavailable");
  assert.equal(withSchema({ ...schema, $schema: "https://example.test/unknown" }).schemaValidation, "unsupported");
  assert.equal(withSchema({ ...schema, $async: true }).schemaValidation, "unsupported");
  assert.equal(withSchema({ type: "object", properties: { params: { $ref: "https://example.test/schema" } } }).schemaValidation, "unsupported");
  assert.equal(withSchema({ type: "object", properties: { params: { type: "string", pattern: "(a+)+$" } } }).schemaValidation, "unsupported");
});
