import { describe, expect, it } from "vitest";
import { bundledDailyOperationsPackage } from "../src/adapters/fixtures/syntheticOperationsPackage";
import { createDashboardOperationsProjection } from "../src/application/dashboardOperationsProjection";
import {
  createDailyOperationsSnapshot,
  createOperationsDecisionWorkspace,
  evaluateOperationsFleet,
  initializeOperationsDecision,
} from "../src/application/operations";
import {
  createSyntheticLiveOperationsFrame,
  syntheticLiveCourierRouteProgress,
  SYNTHETIC_LIVE_SHIFT_TICKS,
} from "../src/application/syntheticLiveOperations";
import { RIDER_ROUTE_TRAVERSE_SECONDS } from "../src/application/riderMapPresentation";
import { validateDailyOperationsPackage } from "../src/domain/operations";

describe("dashboard synthetic live operations", () => {
  it("keeps every accelerated frame inside the approved operations contract", () => {
    for (const tick of [0, 1, 6, 14, 22, SYNTHETIC_LIVE_SHIFT_TICKS, SYNTHETIC_LIVE_SHIFT_TICKS + 1]) {
      const frame = createSyntheticLiveOperationsFrame(
        bundledDailyOperationsPackage,
        tick,
      );
      const validation = validateDailyOperationsPackage(frame.operationsPackage);
      expect(validation.status, JSON.stringify({ tick, validation })).toBe("VALID");
      expect(frame.courierStates).toHaveLength(25);
      expect(
        frame.courierStates.every(
          (state) => state.completedStopCount <= state.totalStopCount,
        ),
      ).toBe(true);
      expect(frame.finished).toBe(false);
      expect(frame.tick).toBe(tick);
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
  }, 15_000);

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

  it("advances a driving courier by the shared calmer route step", () => {
    const first = syntheticLiveCourierRouteProgress("demo-courier-002", 0);
    const next = syntheticLiveCourierRouteProgress("demo-courier-002", 1);

    expect(next - first).toBeCloseTo(1 / RIDER_ROUTE_TRAVERSE_SECONDS, 8);
  });

  it("keeps late-shift snapshots valid and fails closed when no safe intervention remains", async () => {
    const failures: Array<{ tick: number; courierId: string; message: string }> = [];
    for (const tick of [0, SYNTHETIC_LIVE_SHIFT_TICKS]) {
      const frame = createSyntheticLiveOperationsFrame(
        bundledDailyOperationsPackage,
        tick,
      );
      const snapshot = await createDailyOperationsSnapshot(
        frame.operationsPackage,
        { createdAt: frame.operationsPackage.evaluatedAt },
      );
      const fleet = evaluateOperationsFleet(snapshot);
      const queueItems =
        tick === SYNTHETIC_LIVE_SHIFT_TICKS
          ? fleet.supportQueue
          : fleet.supportQueue.slice(0, 1);
      for (const queueItem of queueItems) {
        try {
          initializeOperationsDecision(
            createOperationsDecisionWorkspace(snapshot, fleet),
            snapshot,
            fleet,
            queueItem.decisionId,
          );
        } catch (error) {
          failures.push({
            tick,
            courierId: queueItem.courierId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    expect(
      failures.every((failure) =>
        failure.message.includes("has no feasible intervention"),
      ),
    ).toBe(true);
  });
});
