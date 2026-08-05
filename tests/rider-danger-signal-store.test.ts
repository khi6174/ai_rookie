import { describe, expect, it } from "vitest";
import {
  createMemoryRiderDangerSignalStore,
  handleRiderDangerSignalRequest,
} from "../server/rider-danger-signal-store.mjs";

const signalCommand = {
  schemaVersion: "demo-rider-danger-signal-command-v1",
  courierId: "demo-courier-014",
  source: "SYNTHETIC_RIDER_APP",
};

describe("rider danger signal store", () => {
  it("shares a synthetic signal with ETag polling and expires it after 15 minutes", async () => {
    const memoryStore = createMemoryRiderDangerSignalStore();
    let current = new Date("2026-08-05T06:28:00.000Z");
    const options = { memoryStore, now: () => current };

    const saved = await handleRiderDangerSignalRequest(
      new Request(
        "http://localhost/api/operations/danger-signals/demo-courier-014",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(signalCommand),
        },
      ),
      options,
    );
    expect(saved?.status).toBe(201);
    expect(await saved?.json()).toMatchObject({
      signal: {
        courierId: "demo-courier-014",
        label: "앱 감지 위험 신호",
        source: "SYNTHETIC_RIDER_APP",
      },
      storage: "MEMORY_DEV",
    });

    const loaded = await handleRiderDangerSignalRequest(
      new Request("http://localhost/api/operations/danger-signals"),
      options,
    );
    expect(loaded?.status).toBe(200);
    const etag = loaded?.headers.get("ETag");
    expect(etag).toBeTruthy();
    expect(await loaded?.json()).toMatchObject({
      schemaVersion: "demo-rider-danger-signal-collection-v1",
      signals: [{ courierId: "demo-courier-014" }],
    });

    const unchanged = await handleRiderDangerSignalRequest(
      new Request("http://localhost/api/operations/danger-signals", {
        headers: { "If-None-Match": etag! },
      }),
      options,
    );
    expect(unchanged?.status).toBe(304);

    current = new Date("2026-08-05T06:43:00.000Z");
    const expired = await handleRiderDangerSignalRequest(
      new Request("http://localhost/api/operations/danger-signals", {
        headers: { "If-None-Match": etag! },
      }),
      options,
    );
    expect(expired?.status).toBe(200);
    expect(await expired?.json()).toMatchObject({ signals: [], version: "empty" });
  });

  it("rejects unknown courier ids and untrusted command fields", async () => {
    const memoryStore = createMemoryRiderDangerSignalStore();
    const invalidId = await handleRiderDangerSignalRequest(
      new Request("http://localhost/api/operations/danger-signals/not-a-rider", {
        method: "PUT",
        body: JSON.stringify({ ...signalCommand, courierId: "not-a-rider" }),
      }),
      { memoryStore },
    );
    expect(invalidId?.status).toBe(400);

    const invalidSource = await handleRiderDangerSignalRequest(
      new Request(
        "http://localhost/api/operations/danger-signals/demo-courier-014",
        {
          method: "PUT",
          body: JSON.stringify({ ...signalCommand, source: "LIVE_SENSOR" }),
        },
      ),
      { memoryStore },
    );
    expect(invalidSource?.status).toBe(400);
  });
});
