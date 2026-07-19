import { describe, expect, it } from "vitest";
import { multiRegionMapFixture } from "../src/adapters/fixtures";
import { createFixtureMapAdapter } from "../src/adapters/maps";

describe("provider-independent fixture map adapter", () => {
  const adapter = createFixtureMapAdapter(multiRegionMapFixture);

  it("starts with a national aggregate and no individual couriers", () => {
    const model = adapter.getModel();
    expect(model.scope).toBe("NATIONAL");
    expect(model.regions).toHaveLength(3);
    expect(model.couriers).toEqual([]);
    expect(model.routes).toEqual([]);
    expect(model.regions.every((region) => region.courierCount === 8)).toBe(true);
    expect(
      model.regions.every((region) => region.supportDecisionCount === 4),
    ).toBe(true);
  });

  it("drills into a region without leaking other regions", () => {
    const regionId = multiRegionMapFixture.regions[0].regionId;
    const model = adapter.getModel({ regionId });
    expect(model.scope).toBe("REGION");
    expect(model.hubs).toHaveLength(2);
    expect(model.couriers).toHaveLength(8);
    expect(model.routes).toHaveLength(8);
    expect(model.couriers.every((courier) => courier.regionId === regionId)).toBe(
      true,
    );
  });

  it("resolves a decision to one courier, plan, route, and region", () => {
    const decision = multiRegionMapFixture.decisions[0];
    const selection = adapter.selectionForDecision(decision.decisionId);
    const model = adapter.getModel(selection);
    expect(model.scope).toBe("DECISION");
    expect(model.selectedDecision?.decisionId).toBe(decision.decisionId);
    expect(model.couriers).toHaveLength(1);
    expect(model.routes).toHaveLength(1);
    expect(model.routes[0].selected).toBe(true);
    expect(model.selection.planId).toBe(decision.planId);
  });

  it("rejects unknown and internally inconsistent selections", () => {
    expect(() => adapter.getModel({ regionId: "unknown-region" })).toThrow(
      "Unknown map region",
    );
    const decision = multiRegionMapFixture.decisions[0];
    expect(() =>
      adapter.getModel({
        regionId: multiRegionMapFixture.regions[1].regionId,
        decisionId: decision.decisionId,
      }),
    ).toThrow("does not match");
  });

  it("projects every visible coordinate into the 8..92 viewport", () => {
    const regionId = multiRegionMapFixture.regions[0].regionId;
    const model = adapter.getModel({ regionId });
    const points = [
      ...model.regions.map((item) => item.point),
      ...model.hubs.map((item) => item.point),
      ...model.couriers.flatMap((item) => (item.point ? [item.point] : [])),
      ...model.routes.flatMap((item) => item.points),
    ];
    expect(points.length).toBeGreaterThan(0);
    expect(
      points.every(
        (point) => point.x >= 8 && point.x <= 92 && point.y >= 8 && point.y <= 92,
      ),
    ).toBe(true);
  });
});
