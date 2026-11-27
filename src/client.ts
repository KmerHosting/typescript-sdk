export type ApiEnvelope<T = unknown> = { data: T; request_id: string };
export type RequestOptions = { signal?: AbortSignal };
export type MutationOptions = RequestOptions & { idempotencyKey?: string };
export type KvmAction = "start" | "stop" | "shutdown" | "restart";

export type ClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  /** Public domain search service. Default: https://domain.kmerhosting.com */
  domainSearchUrl?: string;
  fetch?: typeof globalThis.fetch;
  /**
   * Automatic retries for 429, 502, 503 and 504. Enabled by default (3 attempts in total).
   * Pass `false` (or `{ maxAttempts: 1 }`) to disable.
   */
  retry?: false | RetryOptions;
};

export type RetryOptions = {
  /** Total attempts including the first one. Default 3. */
  maxAttempts?: number;
  /** First backoff delay in milliseconds; doubles on each retry. Default 500. */
  baseDelayMs?: number;
  /** Upper bound for any single wait in milliseconds. Default 60000. */
  maxDelayMs?: number;
  /** Replaces the timer used to wait between attempts (useful in tests). */
  sleep?: (ms: number) => Promise<void>;
};

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Result of the public domain search: one entry per requested domain, with current pricing. */
export type DomainSearchResult = { results: Array<Record<string, unknown>> } & Record<string, unknown>;

type ApiErrorBody = { error?: { code?: string; message?: string; request_id?: string } };

export class KmerHostingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "KmerHostingError";
  }
}

/** Thrown for HTTP 429. `retryAfter` is the server-suggested wait in seconds, when sent. */
export class RateLimitError extends KmerHostingError {
  constructor(
    message: string,
    code: string,
    requestId: string | undefined,
    body: unknown,
    public readonly retryAfter?: number,
    public readonly limit?: number,
    public readonly remaining?: number,
  ) {
    super(message, 429, code, requestId, body);
    this.name = "RateLimitError";
  }
}

function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

function parseHeaderNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function environmentApiKey(): string | undefined {
  const processValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processValue?.env?.KMERHOSTING_API_KEY;
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function newIdempotencyKey(): string {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `kh_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
}

export class KmerHostingClient {
  readonly account = {
    get: (options?: RequestOptions) => this.request("GET", "/v1/account", undefined, options),
    apiUsage: (options?: RequestOptions) => this.request("GET", "/v1/account/api-usage", undefined, options),
  };

  readonly services = {
    list: (options?: RequestOptions) => this.request("GET", "/v1/services", undefined, options),
    get: (serviceId: string, options?: RequestOptions) => this.request("GET", `/v1/services/${encode(serviceId)}`, undefined, options),
  };

  readonly domains = {
    list: (options?: RequestOptions) => this.request("GET", "/v1/domains", undefined, options),
    get: (domainId: string, options?: RequestOptions) => this.request("GET", `/v1/domains/${encode(domainId)}`, undefined, options),
    dns: {
      list: (domainId: string, options?: RequestOptions) => this.request("GET", `/v1/domains/${encode(domainId)}/dns`, undefined, options),
      create: (domainId: string, record: Record<string, unknown>, options?: MutationOptions) => this.mutate("POST", `/v1/domains/${encode(domainId)}/dns`, record, options),
      update: (domainId: string, recordId: string, record: Record<string, unknown>, options?: MutationOptions) => this.mutate("PUT", `/v1/domains/${encode(domainId)}/dns/${encode(recordId)}`, record, options),
      delete: (domainId: string, recordId: string, options?: MutationOptions) => this.mutate("DELETE", `/v1/domains/${encode(domainId)}/dns/${encode(recordId)}`, undefined, options),
    },
    setAutoRenew: (domainId: string, enabled: boolean, options?: MutationOptions) => this.mutate("PUT", `/v1/domains/${encode(domainId)}/auto-renew`, { enabled }, options),
    setNameservers: (domainId: string, nameServers: string[], options?: MutationOptions) => this.mutate("PUT", `/v1/domains/${encode(domainId)}/nameservers`, { nameServers }, options),
    /**
     * Check availability and price of 1 to 20 domains. Public endpoint on domain.kmerhosting.com:
     * no API key is sent; limited to 20 requests per IP per minute (a bulk search counts once).
     */
    search: (domains: string | string[], options?: RequestOptions) => this.searchDomains(domains, options),
  };

  readonly email = {
    listServices: (options?: RequestOptions) => this.request("GET", "/v1/email/services", undefined, options),
    provision: (serviceId: string, options?: MutationOptions) => this.mutate("POST", `/v1/email/services/${encode(serviceId)}/provision`, {}, options),
    syncDns: (serviceId: string, options?: MutationOptions) => this.mutate("POST", `/v1/email/services/${encode(serviceId)}/dns/sync`, {}, options),
  };

  readonly hosting = {
    listServices: (options?: RequestOptions) => this.request("GET", "/v1/hosting/services", undefined, options),
    stats: (serviceId: string, options?: RequestOptions) => this.request("GET", `/v1/hosting/services/${encode(serviceId)}/stats`, undefined, options),
    createPanelAccess: (serviceId: string, target: "panel" | "filemanager" = "panel", options?: MutationOptions) => this.mutate("POST", `/v1/hosting/services/${encode(serviceId)}/panel-access`, { target }, options),
  };

  readonly lxc = {
    list: (options?: RequestOptions) => this.request("GET", "/v1/lxc/instances", undefined, options),
    get: (serviceId: string, options?: RequestOptions) => this.request("GET", `/v1/lxc/instances/${encode(serviceId)}`, undefined, options),
    metrics: (serviceId: string, options?: RequestOptions) => this.request("GET", `/v1/lxc/instances/${encode(serviceId)}/metrics`, undefined, options),
    action: (serviceId: string, action: "start" | "restart" | "freeze" | "stop", options?: MutationOptions) => this.mutate("POST", `/v1/lxc/instances/${encode(serviceId)}/actions`, { action }, options),
    changePassword: (serviceId: string, password: string, options?: MutationOptions) => this.mutate("POST", `/v1/lxc/instances/${encode(serviceId)}/password`, { password }, options),
    reinstall: (serviceId: string, distribution: string, options?: MutationOptions) => this.mutate("POST", `/v1/lxc/instances/${encode(serviceId)}/reinstall`, { distribution }, options),
    createTerminalTicket: (serviceId: string, options?: MutationOptions) => this.mutate("POST", `/v1/lxc/instances/${encode(serviceId)}/terminal-ticket`, {}, options),
    setAutoRenew: (serviceId: string, enabled: boolean, options?: MutationOptions) => this.mutate("PUT", `/v1/lxc/instances/${encode(serviceId)}/auto-renew`, { enabled }, options),
    setBillingPeriod: (serviceId: string, billingMonths: 1 | 3 | 6 | 12, options?: MutationOptions) => this.mutate("PUT", `/v1/lxc/instances/${encode(serviceId)}/billing-period`, { billingMonths }, options),
    snapshots: {
      list: (serviceId: string, options?: RequestOptions) => this.request("GET", `/v1/lxc/instances/${encode(serviceId)}/snapshots`, undefined, options),
      mutate: (serviceId: string, action: "create" | "delete" | "restore", name: string, options?: MutationOptions) => this.mutate("POST", `/v1/lxc/instances/${encode(serviceId)}/snapshots`, { action, name }, options),
    },
  };

  readonly kvm = {
    list: (options?: RequestOptions) => this.request("GET", "/v1/kvm/instances", undefined, options),
    get: (serviceId: string, options?: RequestOptions) => this.request("GET", `/v1/kvm/instances/${encode(serviceId)}`, undefined, options),
    action: (serviceId: string, action: KvmAction, options?: MutationOptions) => this.mutate("POST", `/v1/kvm/instances/${encode(serviceId)}/actions`, { action }, options),
    setAutoRenew: (serviceId: string, enabled: boolean, options?: MutationOptions) => this.mutate("PUT", `/v1/kvm/instances/${encode(serviceId)}/auto-renew`, { enabled }, options),
    resetPassword: (serviceId: string, password: string, options?: MutationOptions) => this.mutate("POST", `/v1/kvm/instances/${encode(serviceId)}/password`, { password }, options),
    renew: (serviceId: string, billingMonths?: 1 | 3 | 6 | 12, options?: MutationOptions) => this.mutate("POST", `/v1/kvm/instances/${encode(serviceId)}/renew`, billingMonths ? { billingMonths } : {}, options),
    cancel: (serviceId: string, options?: MutationOptions) => this.mutate("POST", `/v1/kvm/instances/${encode(serviceId)}/cancel`, {}, options),
    keepService: (serviceId: string, options?: MutationOptions) => this.mutate("POST", `/v1/kvm/instances/${encode(serviceId)}/keep-service`, {}, options),
    snapshots: {
      list: (serviceId: string, options?: RequestOptions) => this.request("GET", `/v1/kvm/instances/${encode(serviceId)}/snapshots`, undefined, options),
      create: (serviceId: string, snapshot: { name: string; description?: string }, options?: MutationOptions) => this.mutate("POST", `/v1/kvm/instances/${encode(serviceId)}/snapshots`, snapshot, options),
      update: (serviceId: string, snapshotId: string, snapshot: { name?: string; description?: string }, options?: MutationOptions) => this.mutate("PATCH", `/v1/kvm/instances/${encode(serviceId)}/snapshots/${encode(snapshotId)}`, snapshot, options),
      delete: (serviceId: string, snapshotId: string, options?: MutationOptions) => this.mutate("DELETE", `/v1/kvm/instances/${encode(serviceId)}/snapshots/${encode(snapshotId)}`, undefined, options),
      rollback: (serviceId: string, snapshotId: string, options?: MutationOptions) => this.mutate("POST", `/v1/kvm/instances/${encode(serviceId)}/snapshots/rollback`, { snapshotId }, options),
    },
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly domainSearchUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ClientOptions = {}) {
    this.apiKey = options.apiKey ?? environmentApiKey() ?? "";
    if (!this.apiKey) throw new Error("Set KMERHOSTING_API_KEY or pass apiKey to KmerHostingClient.");
    this.baseUrl = trimBaseUrl(options.baseUrl ?? "https://api.kmerhosting.com");
    this.domainSearchUrl = trimBaseUrl(options.domainSearchUrl ?? "https://domain.kmerhosting.com");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error("A Fetch implementation is required.");
    const retry = options.retry === false ? { maxAttempts: 1 } : options.retry ?? {};
    this.maxAttempts = Math.max(1, Math.floor(retry.maxAttempts ?? 3));
    this.baseDelayMs = retry.baseDelayMs ?? 500;
    this.maxDelayMs = retry.maxDelayMs ?? 60_000;
    this.sleep = retry.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Sends a request, retrying 429/502/503/504. The same init (including the Idempotency-Key header) is reused on every attempt. */
  private async send(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      const response = await this.fetchImpl(url, init);
      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= this.maxAttempts || init.signal?.aborted) return response;
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      const backoff = Math.random() * Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
      const delay = retryAfter === undefined ? backoff : retryAfter * 1000 + Math.random() * 250;
      await response.arrayBuffer().catch(() => undefined);
      await this.sleep(Math.min(this.maxDelayMs, Math.max(0, delay)));
    }
  }

  private async mutate(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body: unknown, options: MutationOptions = {}): Promise<ApiEnvelope> {
    return this.request(method, path, body, options, options.idempotencyKey ?? newIdempotencyKey());
  }

  private async searchDomains(domains: string | string[], options: RequestOptions = {}): Promise<DomainSearchResult> {
    const list = (Array.isArray(domains) ? domains : [domains]).map((domain) => domain.trim()).filter(Boolean);
    if (list.length < 1 || list.length > 20) throw new Error("Pass between 1 and 20 domains to domains.search.");
    const query = new URLSearchParams({ domains: list.join(",") });
    const response = await this.send(`${this.domainSearchUrl}/api/domain-search?${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
    return this.parse<DomainSearchResult>(response);
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown, options: RequestOptions = {}, idempotencyKey?: string): Promise<ApiEnvelope<T>> {
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

    const response = await this.send(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
    return this.parse<ApiEnvelope<T>>(response);
  }

  private async parse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let payload: unknown = undefined;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const error = payload as ApiErrorBody;
      if (response.status === 429) {
        const publicError = payload as { error?: unknown; message?: string };
        throw new RateLimitError(
          error?.error?.message ?? publicError?.message ?? "KmerHosting API rate limit exceeded.",
          error?.error?.code ?? (typeof publicError?.error === "string" ? publicError.error : "rate_limit_exceeded"),
          error?.error?.request_id ?? response.headers.get("X-Request-Id") ?? undefined,
          payload,
          parseRetryAfter(response.headers.get("Retry-After")),
          parseHeaderNumber(response.headers.get("X-RateLimit-Limit")),
          parseHeaderNumber(response.headers.get("X-RateLimit-Remaining")),
        );
      }
      throw new KmerHostingError(
        error?.error?.message ?? `KmerHosting API request failed with status ${response.status}.`,
        response.status,
        error?.error?.code ?? "request_failed",
        error?.error?.request_id ?? response.headers.get("X-Request-Id") ?? undefined,
        payload,
      );
    }
    return payload as T;
  }
}
