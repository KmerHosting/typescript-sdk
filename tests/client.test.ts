import { expect, test } from "bun:test";
import { KmerHostingClient, KmerHostingError, RateLimitError } from "../src/index";

const id = "22222222-2222-4222-8222-222222222222";
const recordId = "33333333-3333-4333-8333-333333333333";

type Call = {
  name: string;
  method: string;
  path: string;
  invoke: (client: KmerHostingClient) => Promise<unknown>;
  body?: unknown;
};

test("maps every public TypeScript SDK operation to the API contract", async () => {
  const requests: Request[] = [];
  const client = new KmerHostingClient({
    apiKey: "kh_live_test",
    baseUrl: "https://example.test/",
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      const method = init?.method ?? "GET";
      return Response.json({ data: { ok: true }, request_id: "test" }, { status: method === "GET" ? 200 : 202 });
    },
  });

  const calls: Call[] = [
    { name: "account.get", method: "GET", path: "/v1/account", invoke: (c) => c.account.get() },
    { name: "account.apiUsage", method: "GET", path: "/v1/account/api-usage", invoke: (c) => c.account.apiUsage() },
    { name: "services.list", method: "GET", path: "/v1/services", invoke: (c) => c.services.list() },
    { name: "services.get", method: "GET", path: `/v1/services/${id}`, invoke: (c) => c.services.get(id) },
    { name: "domains.list", method: "GET", path: "/v1/domains", invoke: (c) => c.domains.list() },
    { name: "domains.get", method: "GET", path: `/v1/domains/${id}`, invoke: (c) => c.domains.get(id) },
    { name: "domains.dns.list", method: "GET", path: `/v1/domains/${id}/dns`, invoke: (c) => c.domains.dns.list(id) },
    { name: "domains.dns.create", method: "POST", path: `/v1/domains/${id}/dns`, body: { type: "A" }, invoke: (c) => c.domains.dns.create(id, { type: "A" }, { idempotencyKey: "dns-create-1" }) },
    { name: "domains.dns.update", method: "PUT", path: `/v1/domains/${id}/dns/${recordId}`, body: { content: "192.0.2.1" }, invoke: (c) => c.domains.dns.update(id, recordId, { content: "192.0.2.1" }, { idempotencyKey: "dns-update-1" }) },
    { name: "domains.dns.delete", method: "DELETE", path: `/v1/domains/${id}/dns/${recordId}`, invoke: (c) => c.domains.dns.delete(id, recordId, { idempotencyKey: "dns-delete-1" }) },
    { name: "domains.setAutoRenew", method: "PUT", path: `/v1/domains/${id}/auto-renew`, body: { enabled: true }, invoke: (c) => c.domains.setAutoRenew(id, true, { idempotencyKey: "domain-renew-1" }) },
    { name: "domains.setNameservers", method: "PUT", path: `/v1/domains/${id}/nameservers`, body: { nameServers: ["ns1.example.test", "ns2.example.test"] }, invoke: (c) => c.domains.setNameservers(id, ["ns1.example.test", "ns2.example.test"], { idempotencyKey: "domain-ns-1" }) },
    { name: "email.listServices", method: "GET", path: "/v1/email/services", invoke: (c) => c.email.listServices() },
    { name: "email.provision", method: "POST", path: `/v1/email/services/${id}/provision`, body: {}, invoke: (c) => c.email.provision(id, { idempotencyKey: "email-provision-1" }) },
    { name: "email.syncDns", method: "POST", path: `/v1/email/services/${id}/dns/sync`, body: {}, invoke: (c) => c.email.syncDns(id, { idempotencyKey: "email-sync-1" }) },
    { name: "hosting.listServices", method: "GET", path: "/v1/hosting/services", invoke: (c) => c.hosting.listServices() },
    { name: "hosting.stats", method: "GET", path: `/v1/hosting/services/${id}/stats`, invoke: (c) => c.hosting.stats(id) },
    { name: "hosting.createPanelAccess", method: "POST", path: `/v1/hosting/services/${id}/panel-access`, body: { target: "filemanager" }, invoke: (c) => c.hosting.createPanelAccess(id, "filemanager", { idempotencyKey: "hosting-panel-1" }) },
    { name: "lxc.list", method: "GET", path: "/v1/lxc/instances", invoke: (c) => c.lxc.list() },
    { name: "lxc.get", method: "GET", path: `/v1/lxc/instances/${id}`, invoke: (c) => c.lxc.get(id) },
    { name: "lxc.metrics", method: "GET", path: `/v1/lxc/instances/${id}/metrics`, invoke: (c) => c.lxc.metrics(id) },
    { name: "lxc.action", method: "POST", path: `/v1/lxc/instances/${id}/actions`, body: { action: "restart" }, invoke: (c) => c.lxc.action(id, "restart", { idempotencyKey: "lxc-action-1" }) },
    { name: "lxc.snapshots.list", method: "GET", path: `/v1/lxc/instances/${id}/snapshots`, invoke: (c) => c.lxc.snapshots.list(id) },
    { name: "lxc.snapshots.mutate", method: "POST", path: `/v1/lxc/instances/${id}/snapshots`, body: { action: "create", name: "before-upgrade" }, invoke: (c) => c.lxc.snapshots.mutate(id, "create", "before-upgrade", { idempotencyKey: "lxc-snapshot-1" }) },
    { name: "lxc.password", method: "POST", path: `/v1/lxc/instances/${id}/password`, body: { password: "Safe-password-123" }, invoke: (c) => c.lxc.changePassword(id, "Safe-password-123", { idempotencyKey: "lxc-password-1" }) },
    { name: "lxc.reinstall", method: "POST", path: `/v1/lxc/instances/${id}/reinstall`, body: { distribution: "ubuntu-24.04" }, invoke: (c) => c.lxc.reinstall(id, "ubuntu-24.04", { idempotencyKey: "lxc-reinstall-1" }) },
    { name: "lxc.terminal", method: "POST", path: `/v1/lxc/instances/${id}/terminal-ticket`, body: {}, invoke: (c) => c.lxc.createTerminalTicket(id, { idempotencyKey: "lxc-terminal-1" }) },
    { name: "lxc.auto-renew", method: "PUT", path: `/v1/lxc/instances/${id}/auto-renew`, body: { enabled: true }, invoke: (c) => c.lxc.setAutoRenew(id, true, { idempotencyKey: "lxc-auto-renew-1" }) },
    { name: "lxc.billing-period", method: "PUT", path: `/v1/lxc/instances/${id}/billing-period`, body: { billingMonths: 3 }, invoke: (c) => c.lxc.setBillingPeriod(id, 3, { idempotencyKey: "lxc-billing-1" }) },
    { name: "kvm.list", method: "GET", path: "/v1/kvm/instances", invoke: (c) => c.kvm.list() },
    { name: "kvm.get", method: "GET", path: `/v1/kvm/instances/${id}`, invoke: (c) => c.kvm.get(id) },
    { name: "kvm.action", method: "POST", path: `/v1/kvm/instances/${id}/actions`, body: { action: "restart" }, invoke: (c) => c.kvm.action(id, "restart", { idempotencyKey: "kvm-action-1" }) },
    { name: "kvm.setAutoRenew", method: "PUT", path: `/v1/kvm/instances/${id}/auto-renew`, body: { enabled: true }, invoke: (c) => c.kvm.setAutoRenew(id, true, { idempotencyKey: "kvm-renew-1" }) },
    { name: "kvm.password", method: "POST", path: `/v1/kvm/instances/${id}/password`, body: { password: "Safe-password-123" }, invoke: (c) => c.kvm.resetPassword(id, "Safe-password-123", { idempotencyKey: "kvm-password-1" }) },
    { name: "kvm.renew", method: "POST", path: `/v1/kvm/instances/${id}/renew`, body: { billingMonths: 3 }, invoke: (c) => c.kvm.renew(id, 3, { idempotencyKey: "kvm-renew-service-1" }) },
    { name: "kvm.cancel", method: "POST", path: `/v1/kvm/instances/${id}/cancel`, body: {}, invoke: (c) => c.kvm.cancel(id, { idempotencyKey: "kvm-cancel-1" }) },
    { name: "kvm.keep", method: "POST", path: `/v1/kvm/instances/${id}/keep-service`, body: {}, invoke: (c) => c.kvm.keepService(id, { idempotencyKey: "kvm-keep-1" }) },
    { name: "kvm.snapshots.list", method: "GET", path: `/v1/kvm/instances/${id}/snapshots`, invoke: (c) => c.kvm.snapshots.list(id) },
    { name: "kvm.snapshots.create", method: "POST", path: `/v1/kvm/instances/${id}/snapshots`, body: { name: "test", description: "snapshot" }, invoke: (c) => c.kvm.snapshots.create(id, { name: "test", description: "snapshot" }, { idempotencyKey: "snapshot-create-1" }) },
    { name: "kvm.snapshots.update", method: "PATCH", path: `/v1/kvm/instances/${id}/snapshots/${recordId}`, body: { name: "renamed" }, invoke: (c) => c.kvm.snapshots.update(id, recordId, { name: "renamed" }, { idempotencyKey: "snapshot-update-1" }) },
    { name: "kvm.snapshots.delete", method: "DELETE", path: `/v1/kvm/instances/${id}/snapshots/${recordId}`, invoke: (c) => c.kvm.snapshots.delete(id, recordId, { idempotencyKey: "snapshot-delete-1" }) },
    { name: "kvm.snapshots.rollback", method: "POST", path: `/v1/kvm/instances/${id}/snapshots/rollback`, body: { snapshotId: recordId }, invoke: (c) => c.kvm.snapshots.rollback(id, recordId, { idempotencyKey: "snapshot-rollback-1" }) },
  ];

  for (const call of calls) {
    await call.invoke(client);
    const request = requests.at(-1)!;
    expect(request.method, call.name).toBe(call.method);
    expect(new URL(request.url).pathname, call.name).toBe(call.path);
    expect(request.headers.get("Authorization"), call.name).toBe("Bearer kh_live_test");
    if (call.method === "GET") {
      expect(request.headers.get("Idempotency-Key"), call.name).toBeNull();
    } else {
      expect(request.headers.get("Idempotency-Key"), call.name).toBeTruthy();
      if (call.body !== undefined) expect(await request.json(), call.name).toEqual(call.body);
    }
  }
  expect(calls).toHaveLength(42);
});

test("preserves structured API errors for SDK callers", async () => {
  const client = new KmerHostingClient({
    apiKey: "kh_live_test",
    baseUrl: "https://example.test",
    fetch: async () => Response.json({ error: { code: "insufficient_scope", message: "The scope is missing.", request_id: "request-1" } }, { status: 403 }),
  });

  try {
    await client.account.get();
    throw new Error("expected KmerHostingError");
  } catch (error) {
    expect(error).toBeInstanceOf(KmerHostingError);
    expect(error).toMatchObject({ status: 403, code: "insufficient_scope", message: "The scope is missing.", requestId: "request-1" });
  }
});

test("generates idempotency keys when callers omit them", async () => {
  let request: Request | undefined;
  const client = new KmerHostingClient({
    apiKey: "kh_live_test",
    baseUrl: "https://example.test",
    fetch: async (input, init) => {
      request = new Request(input, init);
      return Response.json({ data: {}, request_id: "test" }, { status: 202 });
    },
  });
  await client.kvm.action(id, "restart");
  expect(request?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
});

test("normalizes non-JSON API failures into KmerHostingError", async () => {
  const client = new KmerHostingClient({
    apiKey: "kh_live_test",
    baseUrl: "https://example.test",
    fetch: async () => new Response("upstream unavailable", { status: 502 }),
  });
  try {
    await client.account.get();
    throw new Error("expected KmerHostingError");
  } catch (error) {
    expect(error).toBeInstanceOf(KmerHostingError);
    expect(error).toMatchObject({ status: 502, code: "request_failed" });
  }
});

test("searches domains on the public service without sending the API key", async () => {
  const requests: Request[] = [];
  const client = new KmerHostingClient({
    apiKey: "kh_live_test",
    domainSearchUrl: "https://domain.example.test/",
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ results: [{ domainName: "example.com" }, { domainName: "example.cm" }] });
    },
  });

  const result = await client.domains.search(["example.com", " example.cm "]);
  expect(result.results).toHaveLength(2);
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe("GET");
  expect(requests[0].url).toBe("https://domain.example.test/api/domain-search?domains=example.com%2Cexample.cm");
  expect(requests[0].headers.get("Authorization")).toBeNull();

  await expect(client.domains.search([])).rejects.toThrow("between 1 and 20");
  await expect(client.domains.search(Array.from({ length: 21 }, (_, i) => `d${i}.com`))).rejects.toThrow("between 1 and 20");
});

test("raises KmerHostingError when the domain search is rate limited", async () => {
  const client = new KmerHostingClient({
    apiKey: "kh_live_test",
    fetch: async () => Response.json({ error: { code: "rate_limited", message: "Too many searches." } }, { status: 429 }),
  });
  const error = await client.domains.search("example.com").catch((e) => e);
  expect(error).toBeInstanceOf(KmerHostingError);
  expect(error.status).toBe(429);
  expect(error.code).toBe("rate_limited");
});

function retryClient(responses: Array<() => Response>, retry: ConstructorParameters<typeof KmerHostingClient>[0] extends infer O ? (O extends { retry?: infer R } ? R : never) : never = {}) {
  const requests: Request[] = [];
  const waits: number[] = [];
  let index = 0;
  const client = new KmerHostingClient({
    apiKey: "kh_live_test",
    baseUrl: "https://example.test",
    retry: retry === false ? false : { sleep: async (ms) => { waits.push(ms); }, ...retry },
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return responses[Math.min(index++, responses.length - 1)]();
    },
  });
  return { client, requests, waits };
}
const limited = (retryAfter = "2") => () => Response.json({ error: { code: "rate_limit_exceeded", message: "slow down", request_id: "r1" } }, { status: 429, headers: { "Retry-After": retryAfter, "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": "0" } });
const okResponse = () => Response.json({ data: { ok: true }, request_id: "r2" }, { status: 200 });

test("retries 429 honoring Retry-After and reuses the idempotency key", async () => {
  const { client, requests, waits } = retryClient([limited("2"), limited("1"), okResponse]);
  const result = await client.domains.setAutoRenew(id, true);
  expect((result as { request_id: string }).request_id).toBe("r2");
  expect(requests).toHaveLength(3);
  const keys = requests.map((request) => request.headers.get("Idempotency-Key"));
  expect(keys[0]).toBeTruthy();
  expect(new Set(keys).size).toBe(1);
  expect(waits[0]).toBeGreaterThanOrEqual(2000);
  expect(waits[1]).toBeGreaterThanOrEqual(1000);
  expect(waits[1]).toBeLessThan(2000);
});

test("retries 502, 503 and 504 with bounded backoff", async () => {
  const { client, requests, waits } = retryClient([() => new Response("", { status: 502 }), () => new Response("", { status: 503 }), okResponse]);
  await client.account.get();
  expect(requests).toHaveLength(3);
  expect(waits[0]).toBeLessThanOrEqual(500);
  expect(waits[1]).toBeLessThanOrEqual(1000);
});

test("throws RateLimitError carrying retryAfter after the last attempt", async () => {
  const { client, requests } = retryClient([limited("7")]);
  const error = await client.account.get().catch((caught) => caught);
  expect(error).toBeInstanceOf(RateLimitError);
  expect(error).toBeInstanceOf(KmerHostingError);
  expect(error.retryAfter).toBe(7);
  expect(error.limit).toBe(60);
  expect(error.status).toBe(429);
  expect(error.code).toBe("rate_limit_exceeded");
  expect(requests).toHaveLength(3);
});

test("does not retry other errors and can be disabled", async () => {
  const forbidden = retryClient([() => Response.json({ error: { code: "insufficient_scope", message: "no", request_id: "r" } }, { status: 403 })]);
  await expect(forbidden.client.account.get()).rejects.toBeInstanceOf(KmerHostingError);
  expect(forbidden.requests).toHaveLength(1);
  const off = retryClient([limited()], false);
  await expect(off.client.account.get()).rejects.toBeInstanceOf(RateLimitError);
  expect(off.requests).toHaveLength(1);
});
