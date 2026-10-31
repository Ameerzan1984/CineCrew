const privatePathField = /(?:^|_)(?:path|paths|dir|directory|root)$/i;
const privateReferenceFields = new Set(["canonical_image_path", "voice_sample_path", "variations"]);

/** Remove engine-local filesystem references before a saved CineCrew run reaches a browser. */
export function sanitizeAgentRunResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAgentRunResponse);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !privatePathField.test(key) && !privateReferenceFields.has(key))
    .map(([key, nested]) => [key, sanitizeAgentRunResponse(nested)] as const);
  return Object.fromEntries(entries);
}
