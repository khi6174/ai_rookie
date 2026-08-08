import { describe, expect, it } from "vitest";
import { bundledDailyOperationsPackage } from "../src/adapters/fixtures/syntheticOperationsPackage";
import { createDashboardOperationsProjection } from "../src/application/dashboardOperationsProjection";
import {
  createSyntheticLiveOperationsFrame,
  SYNTHETIC_LIVE_MAX_TICK,
} from "../src/application/syntheticLiveOperations";
import { validateDailyOperationsPackage } from "../src/domain/operations";

describe("dashboard synthetic live operations", () => {
  it("keeps every accelerated frame inside the approved operations contract", () => {
    for (const tick of [0, 1, 6, 14, 22, SYNTHETIC_LIVE_MAX_TICK]) {
      const frame = createSyntheticLiveOperationsFrame(
        bundledDailyOperationsPackage,
        tick,
      );
      expect(validateDailyOperationsPackage(frame.operationsPackage).status).toBe(
        "VALID",
      );
      expect(frame.courierStates).toHaveLength(25);
      expect(
        frame.courierStates.every(
          (state) => state.completedStopCount <= state.totalStopCount,
        ),
      ).toBe(true);
    }
  });

  it("advances delivery progress and recalculates Safety Budget from changed inputs", async () => {
    const initial = createSyntheticLiveOperationsFrame(
      bundledDailyOperationsPackage,
      0,
    );
    const advanced = createSyntheticLiveOperationsFrame(
      bundledDailyOperationsPackage,
      10,
    );
    const [initialProjection, advancedProjection] = await Promise.all([
      createDashboardOperationsProjection(initial.operationsPackage, {
        storage: "BUNDLED_FALLBACK",
        sourceBundleId: "test",
      }),
      createDashboardOperationsProjection(advanced.operationsPackage, {
        storage: "BUNDLED_FALLBACK",
        sourceBundleId: "test",
      }),
    ]);
    const initialCourier = initialProjection.couriers.find(
      (courier) => courier.id === "demo-courier-002",
    )!;
    const advancedCourier = advancedProjection.couriers.find(
      (courier) => courier.id === "demo-courier-002",
    )!;

    expect(advancedCourier.completed).toBeGreaterThan(initialCourier.completed);
    expect(advancedCourier.currentScore).toBeLessThan(initialCourier.currentScore);
    expect(advancedCourier.budget).not.toBe(initialCourier.budget);
    expect(advancedCourier.decisionId).not.toBe(initialCourier.decisionId);
  });

  it("represents driving, delivery, delay and rest as deterministic live actions", () => {
    const frames = Array.from({ length: 23 }, (_, tick) =>
      createSyntheticLiveOperationsFrame(bundledDailyOperationsPackage, tick),
    );
    const activities = new Set(
      frames.flatMap((frame) =>
        frame.courierStates.map((state) => state.activity),
      ),
    );
    expect(activities).toEqual(
      new Set(["DRIVING", "DELIVERING", "RESTING", "DELAYED"]),
    );
    expect(
      createSyntheticLiveOperationsFrame(bundledDailyOperationsPackage, 12),
    ).toEqual(
      createSyntheticLiveOperationsFrame(bundledDailyOperationsPackage, 12),
    );
  });
});
