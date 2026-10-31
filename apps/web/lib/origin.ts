export function localHttpOrigin(): boolean {
  try {
    const url = new URL(process.env.APP_ORIGIN || "");
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.origin === process.env.APP_ORIGIN;
  } catch { return false; }
}
export function allowedOrigin(actual: string | null, requestOrigin: string): boolean {
  const configured = process.env.APP_ORIGIN;
  if (process.env.NODE_ENV === "production") {
    if (!configured) return false;
    try {
      const parsed = new URL(configured);
      if (parsed.origin !== configured || (parsed.protocol !== "https:" && !localHttpOrigin())) return false;
    } catch { return false; }
  }
  return !!actual && actual === (configured || requestOrigin);
}
