/** Server-side Higgsfield REST client. Never expose credentials to a browser. */
import { ProviderStateError, ProviderUnavailableError } from "./index.ts";

const API_ORIGIN = "https://api.higgsfield.ai";
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const modelPathPattern = /^\/[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)+$/;
const states = new Set(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]);

export type HiggsfieldStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
export interface HiggsfieldHandle { requestId: string; statusUrl: string; cancelUrl: string; }
export interface HiggsfieldResult {
  requestId: string;
  status: HiggsfieldStatus;
  /** Provider URLs are short-lived. The caller must copy them into its own storage. */
  outputs: { kind: "image" | "video" | "audio"; url: string }[];
  expiresAt: string | null;
}
export class HiggsfieldHttpError extends Error {
  readonly status: number;
  readonly correlationId: string | null;
  readonly retryAfter: string | null;
  constructor(status: number, correlationId: string | null, retryAfter: string | null) {
    super(`Higgsfield API returned HTTP ${status}.`);
    this.name = "HiggsfieldHttpError";
    this.status = status;
    this.correlationId = correlationId;
    this.retryAfter = retryAfter;
  }
}

/** Secrets belong to exactly one user; callers must enforce ownership and use encrypted storage. */
export class HiggsfieldApiClient {
  private verified = false;
  private readonly credentials: { keyId: string; keySecret: string };
  private readonly fetcher: typeof fetch;
  constructor(credentials: { keyId: string; keySecret: string }, fetcher: typeof fetch = fetch) {
    if (!credentials.keyId.trim() || !credentials.keySecret.trim() || /[:\r\n]/.test(credentials.keyId) || /[\r\n]/.test(credentials.keySecret)) {
      throw new ProviderStateError("A valid Higgsfield key ID and secret are required.");
    }
    this.credentials = credentials;
    this.fetcher = fetcher;
  }

  /** True only after a successful authenticated request; never inferred from stored credentials. */
  get connectionVerified(): boolean { return this.verified; }

  private validateHandle(handle: HiggsfieldHandle): void {
    if (!requestIdPattern.test(handle.requestId)) throw new ProviderStateError("Invalid Higgsfield request ID.");
    for (const [url, suffix] of [[handle.statusUrl, "status"], [handle.cancelUrl, "cancel"]] as const) {
      // Exact match prevents leaking credentials to an attacker-controlled URL or another request.
      if (url !== `${API_ORIGIN}/requests/${handle.requestId}/${suffix}`) throw new ProviderStateError("Invalid Higgsfield request URL.");
    }
  }

  private async call(url: string, method: "GET" | "POST", body?: unknown, acceptEmpty202 = false): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method, redirect: "error", signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Key ${this.credentials.keyId}:${this.credentials.keySecret}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      // Do not forward provider/fetch exception text, which may contain headers or URLs.
      throw new ProviderUnavailableError("Higgsfield API request failed or timed out; inspect the provider dashboard before trying the generation again.");
    }
    if (!response.ok) {
      if (response.status === 401) this.verified = false;
      throw new HiggsfieldHttpError(response.status, response.headers.get("x-correlation-id"), response.headers.get("retry-after"));
    }
    if (response.status === 202 && acceptEmpty202) return null;
    try { return await response.json(); }
    catch { throw new ProviderStateError("Higgsfield returned an invalid JSON response."); }
  }

  /** Submit only an endpoint and body verified against that model's current official docs. */
  async submit(modelPath: string, body: Record<string, unknown>): Promise<{ handle: HiggsfieldHandle; result: HiggsfieldResult }> {
    if (!modelPathPattern.test(modelPath) || modelPath.split("/").some(part => part === "." || part === "..") || modelPath.startsWith("/requests/")) {
      throw new ProviderStateError("Invalid model endpoint path.");
    }
    const raw = await this.call(`${API_ORIGIN}${modelPath}`, "POST", body);
    const result = this.parseResult(raw);
    const record = raw as Record<string, unknown>;
    if (typeof record.status_url !== "string" || typeof record.cancel_url !== "string") throw new ProviderStateError("Higgsfield did not return request URLs.");
    const handle = { requestId: result.requestId, statusUrl: record.status_url, cancelUrl: record.cancel_url };
    this.validateHandle(handle);
    this.verified = true;
    return { handle, result };
  }

  /** Persist the handle on the server so status polling can resume after restarts. */
  async status(handle: HiggsfieldHandle): Promise<HiggsfieldResult> {
    this.validateHandle(handle);
    const result = this.parseResult(await this.call(handle.statusUrl, "GET"));
    if (result.requestId !== handle.requestId) throw new ProviderStateError("Higgsfield returned a different request ID.");
    this.verified = true;
    return result;
  }

  /** A 202 confirms cancellation was accepted. The caller should poll for its terminal state. */
  async cancel(handle: HiggsfieldHandle): Promise<void> {
    this.validateHandle(handle);
    await this.call(handle.cancelUrl, "POST", undefined, true);
    this.verified = true;
  }

  private parseResult(value: unknown): HiggsfieldResult {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderStateError("Invalid Higgsfield response.");
    const v = value as Record<string, unknown>;
    if (typeof v.request_id !== "string" || !requestIdPattern.test(v.request_id) || typeof v.status !== "string" || !states.has(v.status)) {
      throw new ProviderStateError("Invalid Higgsfield request ID or status.");
    }
    const outputs: HiggsfieldResult["outputs"] = [];
    const add = (kind: "image" | "video" | "audio", item: unknown) => {
      if (!item || typeof item !== "object") return;
      const url = (item as { url?: unknown }).url;
      if (typeof url !== "string") return;
      try { if (new URL(url).protocol === "https:") outputs.push({ kind, url }); } catch { /* Reject malformed output URLs. */ }
    };
    if (Array.isArray(v.images)) v.images.forEach(item => add("image", item));
    add("video", v.video);
    if (Array.isArray(v.audios)) v.audios.forEach(item => add("audio", item));
    else add("audio", v.audio);
    const expiration = typeof v.expires_at === "string" && Number.isFinite(Date.parse(v.expires_at))
      ? new Date(v.expires_at).toISOString()
      : null;
    return { requestId: v.request_id, status: v.status as HiggsfieldStatus, outputs, expiresAt: expiration };
  }
}
