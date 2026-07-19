import { describe, expect, it } from "vitest";
import {
  MapSelectionSchema,
  MultiRegionMapFixtureSchema,
  PositionObservationSchema,
} from "../src/domain/contracts";
import {
  createMultiRegionMapFixture,
  multiRegionMapFixture,
  scenarioFixtures,
  summarizeMultiRegionMapFixture,
} from "../src/adapters/fixtures";

const clone = <T>(value: T): T => structuredClone(value);

describe("deterministic multi-region map fixture", () => {
  it("creates three regions with eight couriers each", () => {
    expect(MultiRegionMapFixtureSchema.safeParse(multiRegionMapFixture).success).toBe(
      true,
    );
    expect(multiRegionMapFixture.regions).toHaveLength(3);
    expect(multiRegionMapFixture.hubs).toHaveLength(6);
    expect(multiRegionMapFixture.couriers).toHaveLength(24);
    expect(multiRegionMapFixture.routes).toHaveLength(24);
    expect(multiRegionMapFixture.decisions).toHaveLength(12);

    const summaries = summarizeMultiRegionMapFixture(multiRegionMapFixture);
    expect(summaries).toHaveLength(3);
    for (const summary of summaries) {
      expect(summary).toMatchObject({
        courierCount: 8,
        currentPositionCount: 6,
        stalePositionCount: 1,
        offlinePositionCount: 1,
        supportDecisionCount: 4,
      });
    }
  });

  it("reproduces identical JSON for the same seed and reference time", () => {
    const first = createMultiRegionMapFixture({ seed: 6_174 });
    const second = createMultiRegionMapFixture({ seed: 6_174 });
    const differentSeed = createMultiRegionMapFixture({ seed: 6_175 });
    expect(first).toEqual(second);
    expect(first.couriers[0].position).not.toEqual(
      differentSeed.couriers[0].position,
    );
  });

  it("links the three approved representative parent scenarios", () => {
    expect(new Set(multiRegionMapFixture.parentScenarioIds)).toEqual(
      new Set(scenarioFixtures.map((fixture) => fixture.fixtureId)),
    );
    expect(
      new Set(
        multiRegionMapFixture.decisions.map((decision) => decision.parentFixtureId),
      ),
    ).toEqual(new Set(multiRegionMapFixture.parentScenarioIds));
  });

  it("keeps every nested provenance record Demo MOCK", () => {
    const records: Array<Record<string, unknown>> = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if ("kind" in record && "sourceId" in record && "isDemo" in record) {
        records.push(record);
      }
      Object.values(record).forEach(visit);
    };
    visit(multiRegionMapFixture);
    expect(records.length).toBeGreaterThan(0);
    expect(
      records.every(
        (record) => record.kind === "MOCK" && record.isDemo === true,
      ),
    ).toBe(true);
  });

  it("contains no direct identity, address, or contact fields", () => {
    const forbiddenKeys = new Set([
      "name",
      "fullName",
      "phone",
      "phoneNumber",
      "vehicleNumber",
      "address",
      "customerName",
    ]);
    const discovered: string[] = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (forbiddenKeys.has(key)) discovered.push(key);
        visit(child);
      }
    };
    visit(multiRegionMapFixture);
    expect(discovered).toEqual([]);
  });
});

describe("multi-region map contract rejections", () => {
  it("rejects duplicate courier IDs", () => {
    const invalid = clone(multiRegionMapFixture);
    invalid.couriers[1].courierId = invalid.couriers[0].courierId;
    expect(MultiRegionMapFixtureSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a hub-to-courier aggregate mismatch", () => {
    const invalid = clone(multiRegionMapFixture);
    invalid.hubs[0].courierIds.pop();
    expect(MultiRegionMapFixtureSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a position attached to a different courier", () => {
    const invalid = clone(multiRegionMapFixture);
    const projection = invalid.couriers.find(
      (courier) => courier.position.status === "CURRENT",
    );
    if (!projection || projection.position.status !== "CURRENT") {
      throw new Error("Expected a current Demo position");
    }
    projection.position.observation.courierId = invalid.couriers[1].courierId;
    expect(MultiRegionMapFixtureSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects future Demo observations", () => {
    const invalid = clone(multiRegionMapFixture);
    const projection = invalid.couriers.find(
      (courier) => courier.position.status === "CURRENT",
    );
    if (!projection || projection.position.status !== "CURRENT") {
      throw new Error("Expected a current Demo position");
    }
    projection.position.observation.capturedAt = "2026-07-19T00:01:00.000Z";
    projection.position.observation.receivedAt = "2026-07-19T00:01:05.000Z";
    expect(MultiRegionMapFixtureSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects Demo observations carrying Live provenance", () => {
    const projection = multiRegionMapFixture.couriers.find(
      (courier) => courier.position.status === "CURRENT",
    );
    if (!projection || projection.position.status !== "CURRENT") {
      throw new Error("Expected a current Demo position");
    }
    const observation = clone(projection.position.observation);
    observation.provenance[0] = {
      ...observation.provenance[0],
      kind: "LIVE",
      isDemo: false,
    };
    expect(PositionObservationSchema.safeParse(observation).success).toBe(false);
  });

  it("rejects empty map selections and unknown fields", () => {
    expect(MapSelectionSchema.safeParse({}).success).toBe(false);
    expect(
      MapSelectionSchema.safeParse({
        regionId: multiRegionMapFixture.regions[0].regionId,
        courierName: "not-allowed",
      }).success,
    ).toBe(false);
  });
});
