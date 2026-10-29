/** Provider contracts. Provider credentials must remain on the server. */
export type GenerationStatus = "queued" | "completed" | "cancelled";

export interface ProviderCapabilities {
  provider: string;
  available: boolean;
  simulated: boolean;
  generation: boolean;
  cancellation: boolean;
  usage: boolean;
  balance: boolean;
  reason?: string;
}

export interface GenerationRequest {
  prompt: string;
  /** A caller-generated key used to avoid creating duplicate jobs. */
  idempotencyKey: string;
}

export interface GenerationJob {
  id: string;
  status: GenerationStatus;
  simulated: boolean;
}

export interface GenerationOutput {
  simulated: boolean;
  /** Mock results contain a description only, not generated media. */
  description: string;
}

export interface ProviderUsage {
  simulated: boolean;
  jobsCreated: number;
}

export interface ProviderBalance {
  available: boolean;
  amount: number | null;
  currency: string | null;
}

export interface GenerationProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getCapabilities(): Promise<ProviderCapabilities>;
  createGenerationJob(request: GenerationRequest): Promise<GenerationJob>;
  getJobStatus(jobId: string): Promise<GenerationJob>;
  cancelJob(jobId: string): Promise<GenerationJob>;
  fetchOutput(jobId: string): Promise<GenerationOutput>;
  getUsage(): Promise<ProviderUsage>;
  getBalance(): Promise<ProviderBalance>;
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderStateError";
  }
}

/** Explicit, process-local simulator. It never creates or uploads media. */
export class MockProvider implements GenerationProvider {
  private connected = false;
  private jobs = new Map<string, GenerationJob>();
  private idempotency = new Map<string, { prompt: string; jobId: string }>();

  async connect(): Promise<void> { this.connected = true; }
  async disconnect(): Promise<void> { this.connected = false; }

  async getCapabilities(): Promise<ProviderCapabilities> {
    return { provider: "mock", available: true, simulated: true, generation: true,
      cancellation: true, usage: true, balance: false };
  }

  private requireConnection(): void {
    if (!this.connected) throw new ProviderStateError("Mock provider is not connected.");
  }

  private find(jobId: string): GenerationJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new ProviderStateError("Mock job not found.");
    return job;
  }

  async createGenerationJob(request: GenerationRequest): Promise<GenerationJob> {
    this.requireConnection();
    if (!request.prompt.trim() || !request.idempotencyKey.trim()) {
      throw new ProviderStateError("A prompt and idempotency key are required.");
    }
    const prior = this.idempotency.get(request.idempotencyKey);
    if (prior) {
      if (prior.prompt !== request.prompt) throw new ProviderStateError("Idempotency key already used with a different request.");
      return { ...this.find(prior.jobId) };
    }
    const job: GenerationJob = { id: crypto.randomUUID(), status: "queued", simulated: true };
    this.jobs.set(job.id, job);
    this.idempotency.set(request.idempotencyKey, { prompt: request.prompt, jobId: job.id });
    return { ...job };
  }

  async getJobStatus(jobId: string): Promise<GenerationJob> {
    this.requireConnection();
    return { ...this.find(jobId) };
  }

  async cancelJob(jobId: string): Promise<GenerationJob> {
    this.requireConnection();
    const job = this.find(jobId);
    if (job.status === "completed") throw new ProviderStateError("Completed jobs cannot be cancelled.");
    job.status = "cancelled";
    return { ...job };
  }

  async fetchOutput(jobId: string): Promise<GenerationOutput> {
    this.requireConnection();
    const job = this.find(jobId);
    if (job.status === "cancelled") throw new ProviderStateError("Cancelled jobs have no output.");
    job.status = "completed";
    return { simulated: true, description: "Simulated result; no media was generated." };
  }

  async getUsage(): Promise<ProviderUsage> {
    this.requireConnection();
    return { simulated: true, jobsCreated: this.jobs.size };
  }

  async getBalance(): Promise<ProviderBalance> {
    this.requireConnection();
    return { available: false, amount: null, currency: null };
  }
}

/** Explicit placeholder; no OAuth, credentials, requests or live generation are implemented. */
export class HiggsfieldProvider implements GenerationProvider {
  private readonly transport: "mcp" | "api";
  constructor(transport: "mcp" | "api") { this.transport = transport; }

  private unavailable(): never {
    throw new ProviderUnavailableError(`Higgsfield ${this.transport.toUpperCase()} integration is not implemented.`);
  }

  async getCapabilities(): Promise<ProviderCapabilities> {
    return { provider: `higgsfield-${this.transport}`, available: false, simulated: false,
      generation: false, cancellation: false, usage: false, balance: false,
      reason: "Live integration is not implemented." };
  }
  async connect(): Promise<void> { this.unavailable(); }
  async disconnect(): Promise<void> { this.unavailable(); }
  async createGenerationJob(_request: GenerationRequest): Promise<GenerationJob> { return this.unavailable(); }
  async getJobStatus(_jobId: string): Promise<GenerationJob> { return this.unavailable(); }
  async cancelJob(_jobId: string): Promise<GenerationJob> { return this.unavailable(); }
  async fetchOutput(_jobId: string): Promise<GenerationOutput> { return this.unavailable(); }
  async getUsage(): Promise<ProviderUsage> { return this.unavailable(); }
  async getBalance(): Promise<ProviderBalance> { return this.unavailable(); }
}
