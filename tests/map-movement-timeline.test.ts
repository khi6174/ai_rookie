import { describe, expect, it } from "vitest";
import { MapMovementTimelineSchema } from "../src/domain/contracts";
import {
  applyMapMovementFrame,
  createMapMovementTimeline,
  createMultiRegionMapFixture,
  demoReconnectCourierId,
  summarizeMultiRegionMapFixture,
} from "../src/adapters/fixtures";

const clone = <T>(value: T): T => structuredClone(value);

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("deterministic Demo map movement timeline", () => {
  const fixture = createMultiRegionMapFixture();
  const timeline = createMapMovementTimeline(fixture);

  it("creates a fixed 5-second cadence for 24 synthetic couriers", () => {
    expect(MapMovementTimelineSchema.safeParse(timeline).success).toBe(true);
    expect(timeline.dataMode).toBe("DEMO");
    expect(timeline.intervalSeconds).toBe(5);
    expect(timeline.durationSeconds).toBe(30);
    expect(timeline.frames).toHaveLength(7);
    expect(
      timeline.frames.every((frame) => frame.courierPositions.length === 24),
    ).toBe(true);
  });

  it("reproduces the frozen timeline hash for the same seed and start time", async () => {
    const repeated = createMapMovementTimeline(createMultiRegionMapFixture());
    expect(repeated).toEqual(timeline);
    const hash = await sha256(JSON.stringify(timeline));
    expect(hash).toBe("de9cd43b46a26ddbda65df9c04c47ad3466666946bbbde612296afcf7e22c305");
  });

  it("moves only couriers with received current Demo observations", () => {
    const movingCourier = fixture.couriers.find(
      (courier) =>
        courier.position.status === "CURRENT" &&
        courier.courierId !== demoReconnectCourierId,
    )!;
    const points = timeline.frames.map((frame) => {
      const position = frame.courierPositions.find(
        (item) => item.courierId === movingCourier.courierId,
      )!.position;
      if (position.status !== "CURRENT") throw new Error("Expected current Demo position");
      return position.observation.point;
    });
    expect(new Set(points.map((point) => JSON.stringify(point))).size).toBe(7);

    for (const status of ["STALE", "OFFLINE"] as const) {
      const courier = fixture.couriers.find(
        (item) => item.position.status === status,
      )!;
      const positions = timeline.frames.map(
        (frame) => frame.courierPositions.find(
          (item) => item.courierId === courier.courierId,
        )!.position,
      );
      expect(new Set(positions.map((position) => JSON.stringify(position))).size).toBe(1);
    }
  });

  it("stops one synthetic courier during disconnect and resumes only after a received recovery event", () => {
    const statuses = timeline.frames.map(
      (frame) => frame.courierPositions.find(
        (item) => item.courierId === demoReconnectCourierId,
      )!.position.status,
    );
    expect(statuses).toEqual([
      "CURRENT",
      "CURRENT",
      "CURRENT",
      "OFFLINE",
      "OFFLINE",
      "CURRENT",
      "CURRENT",
    ]);
  });

  it("applies each frame as a valid map fixture without changing courier membership", () => {
    const disconnected = applyMapMovementFrame(fixture, timeline, 3);
    const recovered = applyMapMovementFrame(fixture, timeline, 5);
    expect(disconnected.couriers.map((courier) => courier.courierId)).toEqual(
      fixture.couriers.map((courier) => courier.courierId),
    );
    expect(summarizeMultiRegionMapFixture(disconnected)[0]).toMatchObject({
      currentPositionCount: 5,
      stalePositionCount: 1,
      offlinePositionCount: 2,
    });
    expect(summarizeMultiRegionMapFixture(recovered)[0]).toMatchObject({
      currentPositionCount: 6,
      stalePositionCount: 1,
      offlinePositionCount: 1,
    });
  });

  it("rejects broken cadence and mixed Live observations", () => {
    const brokenCadence = clone(timeline);
    brokenCadence.frames[1].elapsedSeconds = 6;
    expect(MapMovementTimelineSchema.safeParse(brokenCadence).success).toBe(false);

    const mixedLive = clone(timeline);
    const current = mixedLive.frames[1].courierPositions.find(
      (item) => item.position.status === "CURRENT",
    )!;
    if (current.position.status !== "CURRENT") throw new Error("Expected current position");
    current.position.observation.sourceMode = "LIVE";
    expect(MapMovementTimelineSchema.safeParse(mixedLive).success).toBe(false);
  });
});
