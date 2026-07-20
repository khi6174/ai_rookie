import { describe, expect, it } from "vitest";
import {
  createMapMovementTimeline,
  createMultiRegionMapFixture,
} from "../src/adapters/fixtures";
import {
  createFixtureMapAdapter,
  mapPerformanceBudget,
} from "../src/adapters/maps";
import { MapMovementTimelineSchema, MultiRegionMapFixtureSchema } from "../src/domain/contracts";

describe("G4-B map load profiles and feature budget", () => {
  it.each([
    { totalCouriers: 24, couriersPerHub: 4, regionCouriers: 8 },
    { totalCouriers: 96, couriersPerHub: 16, regionCouriers: 32 },
    { totalCouriers: 240, couriersPerHub: 40, regionCouriers: 80 },
  ])("creates the $totalCouriers-courier deterministic Demo profile", (profile) => {
    const fixture = createMultiRegionMapFixture({
      couriersPerHub: profile.couriersPerHub,
    });
    expect(MultiRegionMapFixtureSchema.safeParse(fixture).success).toBe(true);
    expect(fixture.couriers).toHaveLength(profile.totalCouriers);
    expect(fixture.routes).toHaveLength(profile.totalCouriers);
    for (const region of fixture.regions) {
      const couriers = fixture.couriers.filter(
        (courier) => courier.regionId === region.regionId,
      );
      expect(couriers).toHaveLength(profile.regionCouriers);
      expect(couriers.filter((courier) => courier.position.status === "STALE")).toHaveLength(1);
      expect(couriers.filter((courier) => courier.position.status === "OFFLINE")).toHaveLength(1);
    }
  });

  it("keeps national aggregation and caps regional route features at the approved ceiling", () => {
    const fixture = createMultiRegionMapFixture({ couriersPerHub: 40 });
    const adapter = createFixtureMapAdapter(fixture);
    const national = adapter.getModel();
    expect(national.couriers).toHaveLength(0);
    expect(national.routes).toHaveLength(0);
    expect(national.featureBudget.totalCouriers).toBe(
      mapPerformanceBudget.maxTotalCouriers,
    );

    const region = adapter.getModel({ regionId: fixture.regions[0].regionId });
    expect(region.couriers).toHaveLength(
      mapPerformanceBudget.maxVisibleRegionCouriers,
    );
    expect(region.routes).toHaveLength(
      mapPerformanceBudget.maxRenderedRegionRoutes,
    );
    expect(region.featureBudget).toMatchObject({
      totalRoutes: 80,
      renderedRoutes: 24,
      routesCapped: true,
    });

    const lastDecision = fixture.decisions.at(-1)!;
    const decision = adapter.getModel(adapter.selectionForDecision(lastDecision.decisionId));
    expect(decision.routes).toHaveLength(1);
    expect(decision.routes[0].courierId).toBe(lastDecision.courierId);
  });

  it("keeps the 240-courier movement timeline Demo-only at the five-second cadence", () => {
    const fixture = createMultiRegionMapFixture({ couriersPerHub: 40 });
    const timeline = createMapMovementTimeline(fixture);
    expect(MapMovementTimelineSchema.safeParse(timeline).success).toBe(true);
    expect(timeline.intervalSeconds).toBe(
      mapPerformanceBudget.minimumPositionIntervalSeconds,
    );
    expect(
      timeline.frames.every((frame) => frame.courierPositions.length === 240),
    ).toBe(true);
  });

  it("rejects unapproved load sizes above or below the evaluated range", () => {
    expect(() => createMultiRegionMapFixture({ couriersPerHub: 3 })).toThrow(
      /between 4 and 40/,
    );
    expect(() => createMultiRegionMapFixture({ couriersPerHub: 41 })).toThrow(
      /between 4 and 40/,
    );
    expect(() => createMultiRegionMapFixture({ couriersPerHub: 4.5 })).toThrow(
      /between 4 and 40/,
    );
  });
});
