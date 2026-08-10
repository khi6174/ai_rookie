import { describe, expect, it } from "vitest";
import {
  createIntegrationSandboxCustomerNotice,
  createIntegrationSandboxPlanCommand,
  createIntegrationSandboxTmsBatch,
} from "../src/application/operations/createIntegrationSandboxScenario";
import {
  createMemoryIntegrationSandboxStore,
  handleIntegrationSandboxRequest,
  type IntegrationSandboxMemoryStore,
} from "../server/integration-sandbox-store.mjs";

const baseUrl = "https://sandbox.test/api/integration-sandbox";
const token = "integration-sandbox-test-token-32-characters";

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly database: FakeD1Database,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first() {
    if (!this.query.includes("FROM integration_sandbox_state")) return null;
    if (!this.database.row || this.database.row.tenant_id !== this.values[0]) return null;
    return {
      site_id: this.database.row.site_id,
      revision: this.database.row.revision,
      payload_json: this.database.row.payload_json,
    };
  }

  async run() {
    if (this.query.startsWith("INSERT INTO integration_sandbox_state")) {
      if (this.database.row) return { meta: { changes: 0 } };
      this.database.row = {
        tenant_id: String(this.values[0]),
        site_id: String(this.values[1]),
        revision: 1,
        payload_json: String(this.values[2]),
        updated_at: String(this.values[3]),
      };
      return { meta: { changes: 1 } };
    }
    if (this.query.startsWith("UPDATE integration_sandbox_state")) {
      if (
        !this.database.row ||
        this.database.row.tenant_id !== this.values[0] ||
        this.database.row.revision !== this.values[4] ||
        this.database.forceConflict
      ) {
        return { meta: { changes: 0 } };
      }
      this.database.row = {
        tenant_id: String(this.values[0]),
        site_id: String(this.values[1]),
        revision: this.database.row.revision + 1,
        payload_json: String(this.values[2]),
        updated_at: String(this.values[3]),
      };
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

class FakeD1Database {
  row?: {
    tenant_id: string;
    site_id: string;
    revision: number;
    payload_json: string;
    updated_at: string;
  };
  forceConflict = false;

  prepare(query: string) {
    return new FakeD1Statement(this, query);
  }

  async batch() {
    return [];
  }
}

function options(
  memoryStore: IntegrationSandboxMemoryStore = createMemoryIntegrationSandboxStore(),
  overrides: Record<string, unknown> = {},
) {
  return {
    memoryStore,
    enabled: true,
    serviceToken: token,
    tenantId: "sandbox-tenant-alpha",
    siteId: "sandbox-site-seoul",
    retentionHours: 24,
    rateLimitPerMinute: 100,
    now: () => new Date("2026-08-10T03:00:00.000Z"),
    ...overrides,
  };
}

function headers(role = "PLATFORM_OPERATOR", overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-sandbox-tenant": "sandbox-tenant-alpha",
    "x-sandbox-site": "sandbox-site-seoul",
    "x-sandbox-actor": "sandbox-actor-admin-001",
    "x-sandbox-role": role,
    ...overrides,
  };
}

function request(path: string, method = "GET", body?: unknown, role?: string) {
  return new Request(`${baseUrl}${path}`, {
    method,
    headers: headers(role),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function batch() {
  return createIntegrationSandboxTmsBatch({
    tenantId: "sandbox-tenant-alpha",
    siteId: "sandbox-site-seoul",
    scenarioId: "sandbox-scenario-normal-001",
    seed: 17,
    startedAt: "2026-08-10T09:00:00+09:00",
    courierCount: 3,
    tick: 0,
    kind: "NORMAL",
  });
}

async function ingest(storeOptions: ReturnType<typeof options>) {
  return handleIntegrationSandboxRequest(
    request("/tms/events", "POST", batch(), "DISPATCHER"),
    storeOptions,
  );
}

describe("Integration-ready Sandbox server Gate", () => {
  it("exposes only a redacted public health response when disabled", async () => {
    const response = await handleIntegrationSandboxRequest(
      new Request(`${baseUrl}/health`),
      { enabled: false },
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      schemaVersion: "integration-sandbox-health-v1",
      status: "DISABLED",
      dataMode: "PRODUCTION_SANDBOX",
      configured: false,
      externalTmsConnected: false,
      actualAuthenticationConnected: false,
      customerNetworkDeliveryEnabled: false,
      actualPersonalDataAllowed: false,
    });
  });

  it("closes configured endpoints before reading a body and requires a scoped principal", async () => {
    const disabled = await handleIntegrationSandboxRequest(
      new Request(`${baseUrl}/tms/events`, { method: "POST", body: "not-json" }),
      { memoryStore: createMemoryIntegrationSandboxStore(), enabled: false },
    );
    expect(disabled?.status).toBe(503);
    await expect(disabled?.json()).resolves.toMatchObject({ code: "INTEGRATION_SANDBOX_NOT_CONFIGURED" });

    const wrongTenant = new Request(`${baseUrl}/readiness`, {
      headers: headers("PLATFORM_OPERATOR", { "x-sandbox-tenant": "sandbox-tenant-other" }),
    });
    const unauthorized = await handleIntegrationSandboxRequest(wrongTenant, options());
    expect(unauthorized?.status).toBe(401);
  });

  it("enforces roles without disclosing another tenant", async () => {
    const response = await handleIntegrationSandboxRequest(
      request("/readiness", "GET", undefined, "COURIER"),
      options(),
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({ code: "SANDBOX_FORBIDDEN" });
  });

  it("ingests only derived simulator events and treats exact retries as idempotent", async () => {
    const storeOptions = options();
    const first = await ingest(storeOptions);
    expect(first?.status).toBe(202);
    await expect(first?.json()).resolves.toMatchObject({
      acceptedCount: 3,
      duplicateCount: 0,
      rawStored: false,
      safetyEngineUsed: false,
    });
    const retry = await ingest(storeOptions);
    expect(retry?.status).toBe(200);
    await expect(retry?.json()).resolves.toMatchObject({ acceptedCount: 0, duplicateCount: 3 });
    expect(storeOptions.memoryStore.events.size).toBe(3);
    expect([...storeOptions.memoryStore.events.values()][0]).not.toHaveProperty("source");
  });

  it("persists the redacted state through the D1 optimistic revision boundary", async () => {
    const database = new FakeD1Database();
    const d1Options = {
      database,
      rateStore: new Map<string, number>(),
      enabled: true,
      serviceToken: token,
      tenantId: "sandbox-tenant-alpha",
      siteId: "sandbox-site-seoul",
      retentionHours: 24,
      rateLimitPerMinute: 100,
      now: () => new Date("2026-08-10T03:00:00.000Z"),
    };
    const first = await handleIntegrationSandboxRequest(
      request("/tms/events", "POST", batch(), "DISPATCHER"),
      d1Options,
    );
    expect(first?.status).toBe(202);
    await expect(first?.json()).resolves.toMatchObject({ storage: "D1_DERIVED_ONLY" });
    expect(database.row?.revision).toBe(1);
    expect(database.row?.payload_json).not.toContain(token);

    const readiness = await handleIntegrationSandboxRequest(
      request("/readiness"),
      d1Options,
    );
    expect(readiness?.status).toBe(200);
    await expect(readiness?.json()).resolves.toMatchObject({
      storage: "D1",
      counts: { events: 3 },
      actualPersonalDataCount: 0,
    });

    database.forceConflict = true;
    const killSwitch = await handleIntegrationSandboxRequest(
      request("/kill-switches", "PATCH", { planApplyDisabled: true, customerNoticeDisabled: true, aiExplanationDisabled: true }),
      d1Options,
    );
    expect(killSwitch?.status).toBe(409);
    await expect(killSwitch?.json()).resolves.toMatchObject({ code: "SANDBOX_STATE_CONFLICT" });
  });

  it("rejects nested personal or precise-location fields", async () => {
    const payload = { ...batch(), metadata: { phone: "010-0000-0000", latitude: 37.5 } };
    const response = await handleIntegrationSandboxRequest(
      request("/tms/events", "POST", payload, "DISPATCHER"),
      options(),
    );
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      code: "SANDBOX_FORBIDDEN_FIELDS",
      issues: [{ fieldPath: "metadata.phone" }, { fieldPath: "metadata.latitude" }],
    });
  });

  it("applies a plan only once in the Simulator and blocks stale versions", async () => {
    const storeOptions = options();
    await ingest(storeOptions);
    const command = createIntegrationSandboxPlanCommand();
    const first = await handleIntegrationSandboxRequest(
      request("/plan-outbox", "POST", command, "DISPATCHER"),
      storeOptions,
    );
    expect(first?.status).toBe(202);
    await expect(first?.json()).resolves.toMatchObject({
      status: "SIMULATED_APPLIED",
      networkRequestPerformed: false,
      nextPlanVersion: 2,
    });
    const retry = await handleIntegrationSandboxRequest(
      request("/plan-outbox", "POST", command, "DISPATCHER"),
      storeOptions,
    );
    expect(retry?.status).toBe(200);
    await expect(retry?.json()).resolves.toMatchObject({ duplicate: true });

    const stale = createIntegrationSandboxPlanCommand({
      commandId: "sandbox-command-0002",
      idempotencyKey: "sandbox-idempotency-plan-0002",
    });
    const staleResponse = await handleIntegrationSandboxRequest(
      request("/plan-outbox", "POST", stale, "DISPATCHER"),
      storeOptions,
    );
    expect(staleResponse?.status).toBe(409);
    await expect(staleResponse?.json()).resolves.toMatchObject({ code: "SANDBOX_STALE_PLAN", currentPlanVersion: 2 });
  });

  it("keeps the active plan when the Simulator fails or the kill switch is set", async () => {
    const failedStore = options(undefined, { faultMode: "FAIL_PLAN" });
    await ingest(failedStore);
    const failed = await handleIntegrationSandboxRequest(
      request("/plan-outbox", "POST", createIntegrationSandboxPlanCommand(), "DISPATCHER"),
      failedStore,
    );
    expect(failed?.status).toBe(503);
    expect(failedStore.memoryStore.planVersions.get("sandbox-tenant-alpha:plan-sandbox-001")).toBe(1);

    const stoppedStore = options();
    await ingest(stoppedStore);
    const update = await handleIntegrationSandboxRequest(
      request("/kill-switches", "PATCH", { planApplyDisabled: true, customerNoticeDisabled: false, aiExplanationDisabled: false }),
      stoppedStore,
    );
    expect(update?.status).toBe(200);
    const blocked = await handleIntegrationSandboxRequest(
      request("/plan-outbox", "POST", createIntegrationSandboxPlanCommand(), "DISPATCHER"),
      stoppedStore,
    );
    expect(blocked?.status).toBe(423);
    await expect(blocked?.json()).resolves.toMatchObject({ code: "SANDBOX_PLAN_KILL_SWITCH" });
  });

  it("records customer notices only after the matching simulated plan and never performs delivery", async () => {
    const storeOptions = options();
    const notice = createIntegrationSandboxCustomerNotice();
    const beforePlan = await handleIntegrationSandboxRequest(
      request("/customer-outbox", "POST", notice, "DISPATCHER"),
      storeOptions,
    );
    expect(beforePlan?.status).toBe(409);

    await ingest(storeOptions);
    await handleIntegrationSandboxRequest(
      request("/plan-outbox", "POST", createIntegrationSandboxPlanCommand(), "DISPATCHER"),
      storeOptions,
    );
    const recorded = await handleIntegrationSandboxRequest(
      request("/customer-outbox", "POST", notice, "DISPATCHER"),
      storeOptions,
    );
    expect(recorded?.status).toBe(202);
    await expect(recorded?.json()).resolves.toMatchObject({
      status: "SIMULATED_RECORDED",
      networkRequestPerformed: false,
      recipientRef: "sandbox-recipient-0001",
    });
  });

  it("rate limits authenticated principals", async () => {
    const storeOptions = options(undefined, { rateLimitPerMinute: 1 });
    expect((await handleIntegrationSandboxRequest(request("/readiness"), storeOptions))?.status).toBe(200);
    const limited = await handleIntegrationSandboxRequest(request("/readiness"), storeOptions);
    expect(limited?.status).toBe(429);
    await expect(limited?.json()).resolves.toMatchObject({ code: "SANDBOX_RATE_LIMITED" });
  });

  it("exports a redacted backup and verifies its hash without mutating state", async () => {
    const storeOptions = options();
    await ingest(storeOptions);
    const response = await handleIntegrationSandboxRequest(request("/backup"), storeOptions);
    expect(response?.status).toBe(200);
    const backup = await response?.json() as Record<string, unknown>;
    expect(backup).toMatchObject({
      schemaVersion: "integration-sandbox-backup-v1",
      actualPersonalDataCount: 0,
      networkDeliveryPerformed: false,
      rawStored: false,
    });
    const before = storeOptions.memoryStore.events.size;
    const verified = await handleIntegrationSandboxRequest(
      request("/restore/verify", "POST", backup),
      storeOptions,
    );
    expect(verified?.status).toBe(200);
    await expect(verified?.json()).resolves.toMatchObject({ verified: true, stateMutationPerformed: false });
    expect(storeOptions.memoryStore.events.size).toBe(before);

    const tampered = { ...backup, capturedAt: "2026-08-10T04:00:00.000Z" };
    const rejected = await handleIntegrationSandboxRequest(
      request("/restore/verify", "POST", tampered),
      storeOptions,
    );
    expect(rejected?.status).toBe(409);
  });

  it("restores a verified synthetic backup only while both kill switches are active", async () => {
    const storeOptions = options();
    await ingest(storeOptions);
    const backupResponse = await handleIntegrationSandboxRequest(request("/backup"), storeOptions);
    const backup = await backupResponse?.json();
    const blocked = await handleIntegrationSandboxRequest(
      request("/restore", "POST", backup),
      storeOptions,
    );
    expect(blocked?.status).toBe(423);
    await expect(blocked?.json()).resolves.toMatchObject({ code: "SANDBOX_RESTORE_REQUIRES_KILL_SWITCHES" });

    await handleIntegrationSandboxRequest(
      request("/kill-switches", "PATCH", { planApplyDisabled: true, customerNoticeDisabled: true, aiExplanationDisabled: true }),
      storeOptions,
    );
    storeOptions.memoryStore.events.clear();
    const restored = await handleIntegrationSandboxRequest(
      request("/restore", "POST", backup),
      storeOptions,
    );
    expect(restored?.status).toBe(200);
    await expect(restored?.json()).resolves.toMatchObject({
      restored: true,
      stateMutationPerformed: true,
      killSwitches: { planApplyDisabled: true, customerNoticeDisabled: true, aiExplanationDisabled: true },
      counts: { events: 3 },
    });
    expect(storeOptions.memoryStore.events.size).toBe(3);
  });

  it("purges expired derived state and records the retention action", async () => {
    const store = createMemoryIntegrationSandboxStore();
    await ingest(options(store, { retentionHours: 1 }));
    expect(store.events.size).toBe(3);
    const later = options(store, {
      retentionHours: 1,
      now: () => new Date("2026-08-10T05:00:00.000Z"),
    });
    const response = await handleIntegrationSandboxRequest(
      request("/retention", "POST"),
      later,
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({ deleted: { events: 3 } });
    expect(store.events.size).toBe(0);
  });
});
