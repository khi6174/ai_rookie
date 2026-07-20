import {
  MapMovementTimelineSchema,
  MultiRegionMapFixtureSchema,
  type MapMovementTimeline,
  type MultiRegionMapFixture,
  type PositionObservation,
  type Provenance,
} from "../../domain/contracts";

const GENERATOR_VERSION = "map-movement-timeline-generator-v1.0.0";
const DEFAULT_INTERVAL_SECONDS = 5;
const DEFAULT_DURATION_SECONDS = 30;
const RECONNECTING_COURIER_ID = "demo-region-north-courier-06";

function atOffset(base: string, milliseconds: number) {
  return new Date(Date.parse(base) + milliseconds).toISOString();
}

function interpolate(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
  ratio: number,
) {
  return {
    latitude: Number((start.latitude + (end.latitude - start.latitude) * ratio).toFixed(7)),
    longitude: Number((start.longitude + (end.longitude - start.longitude) * ratio).toFixed(7)),
  };
}

function pointAlongPath(
  points: Array<{ latitude: number; longitude: number }>,
  progress: number,
) {
  const bounded = Math.max(0, Math.min(1, progress));
  const scaled = bounded * (points.length - 1);
  const startIndex = Math.min(Math.floor(scaled), points.length - 2);
  return interpolate(points[startIndex], points[startIndex + 1], scaled - startIndex);
}

function movementProvenance(fixture: MultiRegionMapFixture): Provenance {
  return {
    kind: "MOCK",
    sourceId: `${fixture.fixtureId}-movement-source`,
    sourceLabel: "SafeRoute deterministic Demo movement timeline",
    collectedAt: fixture.evaluatedAt,
    validAt: fixture.evaluatedAt,
    transformedBy: GENERATOR_VERSION,
    parentSourceIds: fixture.provenance.map((item) => item.sourceId),
    licenseOrPolicy: "Demo-only synthetic movement; no live GPS or observed trajectory",
    isDemo: true,
  };
}

function createMovementObservation(input: {
  base: PositionObservation;
  evaluatedAt: string;
  elapsedSeconds: number;
  point: { latitude: number; longitude: number };
  provenance: Provenance;
}): PositionObservation {
  return {
    ...input.base,
    positionEventId: `${input.base.courierId}-demo-t${String(input.elapsedSeconds).padStart(2, "0")}`,
    capturedAt: atOffset(input.evaluatedAt, -1_000),
    receivedAt: input.evaluatedAt,
    point: input.point,
    sourceMode: "DEMO",
    provenance: [input.provenance],
  };
}

export function createMapMovementTimeline(
  fixture: MultiRegionMapFixture,
  options: { intervalSeconds?: number; durationSeconds?: number } = {},
): MapMovementTimeline {
  const intervalSeconds = options.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  const durationSeconds = options.durationSeconds ?? DEFAULT_DURATION_SECONDS;
  if (durationSeconds % intervalSeconds !== 0) {
    throw new Error("Demo movement duration must be divisible by its interval");
  }
  const provenance = movementProvenance(fixture);
  const frameCount = durationSeconds / intervalSeconds + 1;
  const frames = Array.from({ length: frameCount }, (_, frameIndex) => {
    const elapsedSeconds = frameIndex * intervalSeconds;
    const evaluatedAt = atOffset(fixture.evaluatedAt, elapsedSeconds * 1_000);
    return {
      frameIndex,
      elapsedSeconds,
      evaluatedAt,
      courierPositions: fixture.couriers.map((courier) => {
        if (courier.position.status !== "CURRENT") {
          return { courierId: courier.courierId, position: courier.position };
        }
        if (
          courier.courierId === RECONNECTING_COURIER_ID &&
          (frameIndex === 3 || frameIndex === 4)
        ) {
          return {
            courierId: courier.courierId,
            position: {
              status: "OFFLINE" as const,
              lastApprovedPlanId: courier.planId,
              disconnectedAt: evaluatedAt,
            },
          };
        }
        const route = fixture.routes.find((item) => item.routeId === courier.routeId);
        if (!route) throw new Error(`Missing Demo route: ${courier.routeId}`);
        const path = [courier.position.observation.point, ...route.points];
        const point = pointAlongPath(path, (frameIndex / (frameCount - 1)) * 0.72);
        return {
          courierId: courier.courierId,
          position: {
            status: "CURRENT" as const,
            observation: createMovementObservation({
              base: courier.position.observation,
              evaluatedAt,
              elapsedSeconds,
              point,
              provenance,
            }),
          },
        };
      }),
    };
  });

  return MapMovementTimelineSchema.parse({
    schemaVersion: "map-movement-timeline-v1",
    timelineId: `${fixture.fixtureId}-movement-v1`,
    baseFixtureId: fixture.fixtureId,
    generatorVersion: GENERATOR_VERSION,
    seed: fixture.seed,
    startedAt: fixture.evaluatedAt,
    intervalSeconds,
    durationSeconds,
    dataMode: "DEMO",
    frames,
    provenance: [provenance],
  });
}

export function applyMapMovementFrame(
  fixture: MultiRegionMapFixture,
  timeline: MapMovementTimeline,
  frameIndex: number,
): MultiRegionMapFixture {
  if (timeline.baseFixtureId !== fixture.fixtureId) {
    throw new Error("Movement timeline does not match the map fixture");
  }
  const frame = timeline.frames[frameIndex];
  if (!frame) throw new Error(`Unknown movement frame: ${frameIndex}`);
  const positions = new Map(
    frame.courierPositions.map((item) => [item.courierId, item.position]),
  );
  return MultiRegionMapFixtureSchema.parse({
    ...fixture,
    evaluatedAt: frame.evaluatedAt,
    generatorVersion: `${fixture.generatorVersion}+${timeline.generatorVersion}`,
    couriers: fixture.couriers.map((courier) => ({
      ...courier,
      position: positions.get(courier.courierId) ?? courier.position,
    })),
  });
}

export const demoReconnectCourierId = RECONNECTING_COURIER_ID;
