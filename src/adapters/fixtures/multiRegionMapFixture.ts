import {
  MultiRegionMapFixtureSchema,
  type MapCourierProjection,
  type MapDecisionSummary,
  type MapHub,
  type MapRegion,
  type MapRouteProjection,
  type MultiRegionMapFixture,
  type PositionAvailability,
  type PositionObservation,
  type Provenance,
} from "../../domain/contracts";

const GENERATOR_VERSION = "multi-region-map-generator-v1.1.0";
const DEFAULT_EVALUATED_AT = "2026-07-19T00:00:00.000Z";
const DEFAULT_COURIERS_PER_HUB = 4;
const MAX_COURIERS_PER_HUB = 40;

const parentScenarioIds = [
  "scenario-rain-hill-longshift-v1",
  "scenario-heat-heavy-stairs-v1",
  "scenario-night-novice-area-v1",
] as const;

const regionConfigs = [
  {
    regionId: "demo-region-north",
    label: "합성 북부권역",
    center: { latitude: 37.5904, longitude: 127.0182 },
    parentFixtureId: parentScenarioIds[0],
  },
  {
    regionId: "demo-region-south",
    label: "합성 남부권역",
    center: { latitude: 37.4731, longitude: 126.9637 },
    parentFixtureId: parentScenarioIds[1],
  },
  {
    regionId: "demo-region-west",
    label: "합성 서부권역",
    center: { latitude: 37.5523, longitude: 126.8789 },
    parentFixtureId: parentScenarioIds[2],
  },
] as const;

const decisionStatuses = [
  "SUPPORT_NEEDED",
  "CONSENT_PENDING",
  "APPROVAL_PENDING",
  "APPLIED",
] as const;

function createPrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function atOffset(base: string, milliseconds: number) {
  return new Date(Date.parse(base) + milliseconds).toISOString();
}

function createMockProvenance(evaluatedAt: string): Provenance {
  return {
    kind: "MOCK",
    sourceId: "multi-region-map-fixture-v1-source",
    sourceLabel: "SafeRoute deterministic multi-region map fixture",
    collectedAt: evaluatedAt,
    validAt: evaluatedAt,
    transformedBy: GENERATOR_VERSION,
    licenseOrPolicy: "Demo-only synthetic geospatial projection; no live trajectory",
    isDemo: true,
  };
}

function createObservation(input: {
  courierId: string;
  regionId: string;
  hubId: string;
  planId: string;
  capturedAt: string;
  point: { latitude: number; longitude: number };
  accuracyMeters: number;
  headingDegrees: number;
  speedMetersPerSecond: number;
  provenance: Provenance;
}): PositionObservation {
  return {
    positionEventId: `${input.courierId}-position-current`,
    courierId: input.courierId,
    regionId: input.regionId,
    hubId: input.hubId,
    planId: input.planId,
    capturedAt: input.capturedAt,
    receivedAt: atOffset(input.capturedAt, 5_000),
    point: input.point,
    accuracyMeters: input.accuracyMeters,
    headingDegrees: input.headingDegrees,
    speedMetersPerSecond: input.speedMetersPerSecond,
    sourceMode: "DEMO",
    provenance: [input.provenance],
  };
}

export function createMultiRegionMapFixture(
  options: {
    seed?: number;
    evaluatedAt?: string;
    primaryDecisionId?: string;
    couriersPerHub?: number;
  } = {},
): MultiRegionMapFixture {
  const seed = options.seed ?? 6_174;
  const evaluatedAt = options.evaluatedAt ?? DEFAULT_EVALUATED_AT;
  const couriersPerHub = options.couriersPerHub ?? DEFAULT_COURIERS_PER_HUB;
  if (
    !Number.isInteger(couriersPerHub) ||
    couriersPerHub < DEFAULT_COURIERS_PER_HUB ||
    couriersPerHub > MAX_COURIERS_PER_HUB
  ) {
    throw new Error(
      `couriersPerHub must be an integer between ${DEFAULT_COURIERS_PER_HUB} and ${MAX_COURIERS_PER_HUB}`,
    );
  }
  const random = createPrng(seed);
  const provenance = createMockProvenance(evaluatedAt);
  const regions: MapRegion[] = [];
  const hubs: MapHub[] = [];
  const couriers: MapCourierProjection[] = [];
  const routes: MapRouteProjection[] = [];
  const decisions: MapDecisionSummary[] = [];

  regionConfigs.forEach((regionConfig, regionIndex) => {
    const regionHubIds = [0, 1].map(
      (hubIndex) => `${regionConfig.regionId}-hub-${hubIndex + 1}`,
    );
    regions.push({
      regionId: regionConfig.regionId,
      label: regionConfig.label,
      center: regionConfig.center,
      hubIds: regionHubIds,
      provenance: [provenance],
    });

    regionHubIds.forEach((hubId, hubIndex) => {
      const hubCenter = {
        latitude: regionConfig.center.latitude + (hubIndex === 0 ? 0.012 : -0.012),
        longitude: regionConfig.center.longitude + (hubIndex === 0 ? -0.014 : 0.014),
      };
      const courierIds: string[] = [];

      for (let courierOffset = 0; courierOffset < couriersPerHub; courierOffset += 1) {
        const regionCourierIndex = hubIndex * couriersPerHub + courierOffset;
        const regionCourierCount = couriersPerHub * regionHubIds.length;
        const courierId = `${regionConfig.regionId}-courier-${String(regionCourierIndex + 1).padStart(2, "0")}`;
        const planId = `${courierId}-plan`;
        const routeId = `${courierId}-route`;
        const hasDecision = regionCourierIndex < decisionStatuses.length;
        const decisionId = hasDecision
          ? regionIndex === 0 && regionCourierIndex === 0
            ? (options.primaryDecisionId ?? "decision-scenario-a-ui-v1")
            : `${courierId}-decision`
          : undefined;
        const supportStatus = hasDecision
          ? decisionStatuses[regionCourierIndex]
          : regionCourierIndex === regionCourierCount - 1
            ? "OFFLINE"
            : "OPERATING";
        courierIds.push(courierId);

        const point = {
          latitude: hubCenter.latitude + (random() - 0.5) * 0.012,
          longitude: hubCenter.longitude + (random() - 0.5) * 0.012,
        };
        const capturedAt = atOffset(
          evaluatedAt,
          -(regionCourierIndex * 30 + regionIndex * 5 + 10) * 1_000,
        );
        const observation = createObservation({
          courierId,
          regionId: regionConfig.regionId,
          hubId,
          planId,
          capturedAt:
            regionCourierIndex === 6
              ? atOffset(evaluatedAt, -20 * 60_000)
              : capturedAt,
          point,
          accuracyMeters: Number((8 + random() * 12).toFixed(2)),
          headingDegrees: Number((random() * 360).toFixed(2)),
          speedMetersPerSecond: Number((2.5 + random() * 5).toFixed(2)),
          provenance,
        });
        let position: PositionAvailability;
        if (regionCourierIndex === regionCourierCount - 2) {
          position = {
            status: "STALE",
            lastObservation: observation,
            staleSince: atOffset(evaluatedAt, -10 * 60_000),
          };
        } else if (regionCourierIndex === regionCourierCount - 1) {
          position = {
            status: "OFFLINE",
            lastApprovedPlanId: planId,
            disconnectedAt: atOffset(evaluatedAt, -25 * 60_000),
          };
        } else {
          position = { status: "CURRENT", observation };
        }

        const routePoints = [0, 1, 2, 3].map((pointIndex) => ({
          latitude: point.latitude + pointIndex * 0.0025,
          longitude:
            point.longitude +
            (pointIndex % 2 === 0 ? 1 : -1) * (0.0015 + random() * 0.001),
        }));
        routes.push({
          routeId,
          courierId,
          planId,
          points: routePoints,
          provenance: [provenance],
        });
        couriers.push({
          courierId,
          regionId: regionConfig.regionId,
          hubId,
          planId,
          routeId,
          decisionId,
          supportStatus,
          safeUntilAt:
            supportStatus === "OFFLINE"
              ? undefined
              : atOffset(evaluatedAt, (35 + regionCourierIndex * 7) * 60_000),
          position,
          provenance: [provenance],
        });
        if (decisionId) {
          decisions.push({
            decisionId,
            courierId,
            planId,
            parentFixtureId: regionConfig.parentFixtureId,
            status: decisionStatuses[regionCourierIndex],
            provenance: [provenance],
          });
        }
      }

      hubs.push({
        hubId,
        regionId: regionConfig.regionId,
        label: `${regionConfig.label} ${hubIndex + 1}허브`,
        center: hubCenter,
        courierIds,
        provenance: [provenance],
      });
    });
  });

  return MultiRegionMapFixtureSchema.parse({
    fixtureId: couriersPerHub === DEFAULT_COURIERS_PER_HUB
      ? "multi-region-map-demo-v1"
      : `multi-region-map-demo-${couriers.length}-v1`,
    fixtureVersion: "1.1.0",
    generatorVersion: GENERATOR_VERSION,
    seed,
    evaluatedAt,
    timeZone: "Asia/Seoul",
    dataMode: "DEMO",
    parentScenarioIds: [...parentScenarioIds],
    regions,
    hubs,
    couriers,
    routes,
    decisions,
    provenance: [provenance],
  });
}

export const multiRegionMapFixture = createMultiRegionMapFixture();

export type RegionMapSummary = {
  regionId: string;
  courierCount: number;
  currentPositionCount: number;
  stalePositionCount: number;
  offlinePositionCount: number;
  supportDecisionCount: number;
};

export function summarizeMultiRegionMapFixture(
  fixture: MultiRegionMapFixture,
): RegionMapSummary[] {
  return fixture.regions.map((region) => {
    const regionCouriers = fixture.couriers.filter(
      (courier) => courier.regionId === region.regionId,
    );
    return {
      regionId: region.regionId,
      courierCount: regionCouriers.length,
      currentPositionCount: regionCouriers.filter(
        (courier) => courier.position.status === "CURRENT",
      ).length,
      stalePositionCount: regionCouriers.filter(
        (courier) => courier.position.status === "STALE",
      ).length,
      offlinePositionCount: regionCouriers.filter(
        (courier) => courier.position.status === "OFFLINE",
      ).length,
      supportDecisionCount: regionCouriers.filter(
        (courier) => courier.decisionId !== undefined,
      ).length,
    };
  });
}
