import { describe, expect, it } from "vitest";
import {
  DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY,
  loadDemoRiderDangerSignal,
  publishDemoRiderDangerSignal,
} from "../src/application/demoRiderDangerSignal";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("demo rider danger signal", () => {
  it("stores a validated synthetic signal for 15 minutes", () => {
    const storage = memoryStorage();
    const now = new Date("2026-08-01T06:28:00.000Z");
    const result = publishDemoRiderDangerSignal({
      courierId: "R-022",
      now,
      storage,
    });

    expect(result.persisted).toBe(true);
    expect(storage.getItem(DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY)).toContain(
      "SYNTHETIC_RIDER_APP",
    );
    expect(loadDemoRiderDangerSignal(storage, now.getTime())).toMatchObject({
      courierId: "R-022",
      label: "앱 감지 위험 신호",
    });
    expect(
      loadDemoRiderDangerSignal(storage, now.getTime() + 15 * 60_000),
    ).toBeUndefined();
  });

  it("rejects damaged browser state", () => {
    const storage = memoryStorage();
    storage.setItem(DEMO_RIDER_DANGER_SIGNAL_STORAGE_KEY, "not-json");
    expect(loadDemoRiderDangerSignal(storage)).toBeUndefined();
  });
});
