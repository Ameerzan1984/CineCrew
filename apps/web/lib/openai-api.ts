import { OPENAI_API_RESOURCE } from "./chatgpt-plan-oauth.ts";

export async function listOpenAIApiModels(apiKey: string) {
  const response = await fetch(`${OPENAI_API_RESOURCE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenAI API model catalog failed (HTTP ${response.status})`);
  const data = await response.json() as { data?: Array<{ id?: unknown }> };
  if (!Array.isArray(data.data)) throw new Error("OpenAI API model catalog is invalid");
  return data.data.filter(item => typeof item.id === "string" && item.id.length > 0 && item.id.length <= 160)
    .map(item => ({ id: item.id as string, name: item.id as string }));
}
