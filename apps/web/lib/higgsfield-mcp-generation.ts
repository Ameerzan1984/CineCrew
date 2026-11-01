import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { HiggsfieldMcpTool } from "./higgsfield-mcp-oauth";

/** Load this catalog from server-side storage for the authenticated user, never from a browser request. */
export type HiggsfieldMcpCatalog = {
  ownerId: string;
  verifiedAt: string | null;
  accessExpiresAt: number | null;
  tools: HiggsfieldMcpTool[];
};

export type McpCandidate = {
  actorId: string;
  filmId: string;
  shotId: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

export type McpCandidateInspection = {
  schemaValidation: "valid" | "invalid" | "unavailable" | "unsupported";
  reason: string;
  validationErrors: Array<{ path: string; keyword: string }>;
  /** This adapter never authorizes a provider call or asserts a price. */
  canSubmit: false;
  estimatedCredits: null;
  blockers: readonly string[];
};

const BLOCKERS = [
  "contributor_authorization_not_verified",
  "provider_cost_contract_unverified",
  "provider_confirmation_contract_unverified",
  "live_dispatch_not_implemented",
] as const;

function result(schemaValidation: McpCandidateInspection["schemaValidation"], reason: string,
  validationErrors: McpCandidateInspection["validationErrors"] = []): McpCandidateInspection {
  return { schemaValidation, reason, validationErrors, canSubmit: false, estimatedCredits: null, blockers: [...BLOCKERS] };
}

function cloneJson(value: unknown, maxBytes: number): unknown | null {
  try {
    const text = JSON.stringify(value, (_key, item: unknown) => {
      if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint" ||
          (typeof item === "number" && !Number.isFinite(item))) throw new Error("Not JSON");
      return item;
    });
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxBytes) return null;
    return JSON.parse(text) as unknown;
  } catch { return null; }
}

/** Reject unbounded or potentially expensive schema constructs until validated in an isolated runtime. */
function safeSchemaTree(value: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (++nodes > 2048 || current.depth > 24) return false;
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      for (const child of current.value) stack.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    for (const [key, child] of Object.entries(current.value)) {
      if ((key === "$ref" || key === "$dynamicRef" || key === "pattern") && typeof child === "string") return false;
      if (key === "$async" && child === true) return false;
      if (key === "patternProperties" && child && typeof child === "object") return false;
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return true;
}

function boundedInputTree(value: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (++nodes > 1024 || current.depth > 16) return false;
    if (typeof current.value === "string" && current.value.length > 4096) return false;
    if (!current.value || typeof current.value !== "object") continue;
    const children = Array.isArray(current.value) ? current.value : Object.values(current.value);
    if (children.length > 100) return false;
    for (const child of children) stack.push({ value: child, depth: current.depth + 1 });
  }
  return true;
}

function hasAdvertisedParameters(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 24) return false;
  const schema = value as Record<string, unknown>;
  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) && Object.keys(schema.properties).length) return true;
  return [schema.anyOf, schema.oneOf, schema.allOf].some(branches =>
    Array.isArray(branches) && branches.some(branch => hasAdvertisedParameters(branch, depth + 1)),
  );
}

/** Read-only validation. It does not receive OAuth tokens and cannot submit MCP calls. */
export class HiggsfieldMcpGenerationProvider {
  private readonly catalog: HiggsfieldMcpCatalog;

  constructor(catalog: HiggsfieldMcpCatalog) {
    this.catalog = catalog;
  }

  inspect(candidate: McpCandidate, now = Date.now()): McpCandidateInspection {
    if (!candidate.actorId || candidate.actorId !== this.catalog.ownerId || !this.catalog.verifiedAt ||
        !Number.isFinite(Date.parse(this.catalog.verifiedAt)) ||
        (this.catalog.accessExpiresAt !== null && (!Number.isFinite(this.catalog.accessExpiresAt) || this.catalog.accessExpiresAt <= now))) {
      return result("unavailable", "The contributor's verified MCP connection is unavailable or expired.");
    }
    if (!candidate.filmId || !candidate.shotId || !candidate.toolName) return result("invalid", "Film, shot and tool are required.");
    const matches = this.catalog.tools.filter(tool => tool.name === candidate.toolName);
    if (matches.length !== 1) return result("unavailable", "The requested tool is not uniquely advertised by this connection.");
    const schema = cloneJson(matches[0].inputSchema, 16_384);
    const args = cloneJson(candidate.arguments, 65_536);
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return result("unavailable", "The tool does not provide a usable input schema.");
    if (!args || typeof args !== "object" || Array.isArray(args) || !boundedInputTree(args)) {
      return result("invalid", "Tool arguments must be a bounded JSON object.");
    }
    const definition = schema as Record<string, unknown>;
    if (definition.type !== "object" || !hasAdvertisedParameters(definition)) {
      return result("unavailable", "The advertised schema is opaque or does not describe tool parameters.");
    }
    if (!safeSchemaTree(definition)) return result("unsupported", "The advertised schema uses unsupported or excessive validation constructs.");
    const dialect = definition.$schema;
    if (dialect !== undefined && dialect !== "https://json-schema.org/draft/2020-12/schema" &&
        dialect !== "http://json-schema.org/draft-07/schema#") return result("unsupported", "The advertised schema dialect is not supported.");
    try {
      const options = { strict: true, allErrors: false, validateFormats: true } as const;
      const validator = dialect === "http://json-schema.org/draft-07/schema#" ? new Ajv(options) : new Ajv2020(options);
      addFormats(validator);
      const validate = validator.compile(definition);
      if (!validate(args)) return result("invalid", "The arguments do not match the advertised input schema.",
        (validate.errors ?? []).slice(0, 8).map(error => ({ path: error.instancePath.slice(0, 200), keyword: error.keyword })));
      return result("valid", "Arguments match the supported schema subset; execution and credit cost remain unverified.");
    } catch { return result("unsupported", "The advertised schema could not be safely compiled."); }
  }

  submit(): never {
    throw new Error("Higgsfield MCP generation is disabled until provider cost and confirmation contracts are verified.");
  }
}
