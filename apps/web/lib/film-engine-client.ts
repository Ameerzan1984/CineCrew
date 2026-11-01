export async function callFilmEngine(path: string, init: RequestInit = {}) {
  if (!process.env.FILM_ENGINE_URL || !process.env.FILM_ENGINE_SERVICE_TOKEN) throw new Error("Film engine is not configured");
  return fetch(`${process.env.FILM_ENGINE_URL.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Cinemesh-Service-Token": process.env.FILM_ENGINE_SERVICE_TOKEN, ...init.headers },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
}
