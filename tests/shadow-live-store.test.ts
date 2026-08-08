import { describe, expect, it } from "vitest";
import {
  createMemoryShadowLiveStore,
  handleShadowLiveRequest,
} from "../server/shadow-live-store.mjs";

const endpoint = "https://example.test/api/operations/shadow-live/events";
const statusEndpoint = "https://example.test/api/operations/shadow-live/status";
const token = "shadow-live-test-token-32-characters-long";
const connectionId = "shadow-pilot-01";

function batch(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "shadow-live-progress-batch-v1",
    dataMode: "LIVE_PILOT",
    source: {
      kind: "READ_ONLY_CONNECTOR",
      connectionId,
      generatedAt: "2026-08-08T12:00:10+09:00",
    },
    events: [
      {
        eventId: "event-0001",
        sequence: 1,
        occurredAt: "2026-08-08T12:00:00+09:00",
        eventType: "STOP_PROGRESS",
        courierRef: "anon-rider-001",
        planRef: "plan-route-001",
        completedStopCount: 6,
        totalStopCount: 14,
        coarseZone: "북부권역 A구역",
      },
    ],
    ...overrides,
  };
}

function request(payload: unknown, authorization = `Bearer ${token}`) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function options() {
  return {
    memoryStore: createMemoryShadowLiveStore(),
    enabled: true,
    ingestToken: token,
    connectionId,
    retentionHours: 6,
    now: () => new Date("2026-08-08T03:01:00.000Z"),
  };
}

describe("Shadow Live server Gate", () => {
  it("returns a configuration error before reading or validating input", async () => {
    const response = await handleShadowLiveRequest(
      new Request(endpoint, { method: "POST", body: "not-json" }),
      { memoryStore: createMemoryShadowLiveStore(), enabled: false },
    );
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      code: "SHADOW_LIVE_NOT_CONFIGURED",
    });
  });

  it("requires the connector-scoped bearer token", async () => {
    const response = await handleShadowLiveRequest(request(batch(), "Bearer wrong"), options());
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toMatchObject({
      code: "SHADOW_LIVE_UNAUTHORIZED",
    });
  });

  it("stores only validated derived fields and reports a redacted status", async () => {
    const storeOptions = options();
    const response = await handleShadowLiveRequest(request(batch()), storeOptions);
    expect(response?.status).toBe(202);
    await expect(response?.json()).resolves.toMatchObject({
      acceptedCount: 1,
      duplicateCount: 0,
      rawStored: false,
      safetyEngineUsed: false,
    });

    const stored = [...storeOptions.memoryStore.events.values()][0];
    expect(stored).toMatchObject({
      eventId: "event-0001",
      connectionId,
      courierRef: "anon-rider-001",
      completedStopCount: 6,
    });
    expect(stored).not.toHaveProperty("source");
    expect(stored).not.toHaveProperty("raw");

    const status = await handleShadowLiveRequest(
      new Request(statusEndpoint, {
        headers: { authorization: `Bearer ${token}` },
      }),
      storeOptions,
    );
    expect(status?.status).toBe(200);
    await expect(status?.json()).resolves.toEqual({
      schemaVersion: "shadow-live-status-v1",
      connectionId,
      eventCount: 1,
      courierCount: 1,
      latestSequence: 1,
      latestOccurredAt: "2026-08-08T12:00:00+09:00",
      latestReceivedAt: "2026-08-08T03:01:00.000Z",
      storage: "MEMORY_DEV_DERIVED_ONLY",
      retentionHours: 6,
      rawStored: false,
      readOnly: true,
      safetyEngineUsed: false,
    });
  });

  it("rejects forbidden fields recursively without storing an event", async () => {
    const storeOptions = options();
    const payload = batch({
      events: [{ ...batch().events[0], metadata: { latitude: 37.5 } }],
    });
    const response = await handleShadowLiveRequest(request(payload), storeOptions);
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      code: "SHADOW_LIVE_CONTRACT_REJECTED",
      issues: [{ fieldPath: "events.0.metadata.latitude" }],
    });
    expect(storeOptions.memoryStore.events.size).toBe(0);
  });

  it("treats exact retries as idempotent", async () => {
    const storeOptions = options();
    expect((await handleShadowLiveRequest(request(batch()), storeOptions))?.status).toBe(202);
    const retry = await handleShadowLiveRequest(request(batch()), storeOptions);
    expect(retry?.status).toBe(200);
    await expect(retry?.json()).resolves.toMatchObject({
      acceptedCount: 0,
      duplicateCount: 1,
    });
    expect(storeOptions.memoryStore.events.size).toBe(1);
  });

  it("rejects a reused event ID with different derived content", async () => {
    const storeOptions = options();
    await handleShadowLiveRequest(request(batch()), storeOptions);
    const changed = batch({
      events: [{ ...batch().events[0], completedStopCount: 7 }],
    });
    const response = await handleShadowLiveRequest(request(changed), storeOptions);
    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toMatchObject({
      code: "SHADOW_LIVE_EVENT_CONFLICT",
    });
  });

  it("rejects a new event older than the stored connection sequence", async () => {
    const storeOptions = options();
    await handleShadowLiveRequest(request(batch({
      events: [{ ...batch().events[0], eventId: "event-0005", sequence: 5 }],
    })), storeOptions);
    const response = await handleShadowLiveRequest(request(batch({
      events: [{ ...batch().events[0], eventId: "event-0004", sequence: 4 }],
    })), storeOptions);
    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toMatchObject({
      code: "SHADOW_LIVE_SEQUENCE_CONFLICT",
    });
  });
});
