const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states = ["queued", "running", "uncertain", "completed", "failed"] as const;
export type SchedulerProgress = Record<(typeof states)[number], number>;

/** The URL and service token come from trusted server configuration, never a request. */
export async function readSchedulerProgress(serviceUrl: string, serviceToken: string, filmId: string, actorId: string, fetcher: typeof fetch = fetch): Promise<SchedulerProgress> {
  if (!serviceToken || !uuid.test(filmId) || !uuid.test(actorId)) throw new Error("Scheduler unavailable");
  const base = new URL(serviceUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Scheduler unavailable");
  const response = await fetcher(new URL(`/projects/${filmId}/progress`, base), {
    headers: { "X-Cinemesh-Service-Token": serviceToken, "X-Cinemesh-Actor": actorId },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Scheduler unavailable");
  const body = await response.text();
  if (body.length > 8192) throw new Error("Invalid scheduler response");
  const raw: unknown = JSON.parse(body);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid scheduler response");
  const values = raw as Record<string, unknown>;
  if (Object.keys(values).some(key => !states.includes(key as (typeof states)[number]))) throw new Error("Invalid scheduler response");
  const result = {} as SchedulerProgress;
  for (const state of states) {
    const count = values[state] ?? 0;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid scheduler response");
    result[state] = count;
  }
  return result;
}
