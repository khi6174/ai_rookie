import {
  DecisionSpatialSceneSchema,
  type DecisionSpatialScene,
  type MultiRegionMapFixture,
  type Provenance,
} from "../../domain/contracts";
import type { MapRenderModel } from "./index";

const GENERATOR_VERSION = "decision-spatial-scene-generator-v1.0.0";

export const spatialScenePerformanceBudget = Object.freeze({
  schemaVersion: "spatial-scene-performance-budget-v1",
  maximumFirstDisplayMs: 1_000,
  maximumModeSwitchMs: 300,
  maximumDecisionResponseMs: 300,
  maximumP95FrameGapMs: 100,
  maximumFrameGapMs: 250,
  maximumAdditionalGzipJsKiB: 50,
});

function createSpatialProvenance(
  fixture: MultiRegionMapFixture,
): Provenance {
  return {
    kind: "MOCK",
    sourceId: "decision-spatial-scene-v1-source",
    sourceLabel: "SafeRoute deterministic Demo elevation profile",
    collectedAt: fixture.evaluatedAt,
    validAt: fixture.evaluatedAt,
    transformedBy: GENERATOR_VERSION,
    licenseOrPolicy:
      "Demo-only synthetic elevation and slope; no live GPS, terrain, or building data",
    isDemo: true,
  };
}

export function createDecisionSpatialScene(
  fixture: MultiRegionMapFixture,
  decisionId: string,
): DecisionSpatialScene {
  const decision = fixture.decisions.find(
    (candidate) => candidate.decisionId === decisionId,
  );
  if (!decision) throw new Error(`Unknown spatial decision: ${decisionId}`);
  const courier = fixture.couriers.find(
    (candidate) => candidate.courierId === decision.courierId,
  );
  const route = courier
    ? fixture.routes.find((candidate) => candidate.routeId === courier.routeId)
    : undefined;
  if (!courier || !route || route.points.length !== 4) {
    throw new Error(`Spatial decision requires one four-point route: ${decisionId}`);
  }
  if (
    decision.planId !== courier.planId ||
    route.planId !== decision.planId ||
    route.courierId !== decision.courierId
  ) {
    throw new Error(`Spatial decision scope mismatch: ${decisionId}`);
  }

  const provenance = createSpatialProvenance(fixture);
  const distances = [0, 750, 1_650, 2_550] as const;
  const elevations = [42, 49.5, 72, 88.2] as const;
  const segmentKinds = [
    "NORMAL",
    "REST_POINT",
    "SLOPE_EXPOSURE",
    "BREACH_POINT",
  ] as const;

  return DecisionSpatialSceneSchema.parse({
    schemaVersion: "decision-spatial-scene-v1",
    sceneId: `${decisionId}-spatial-scene`,
    decisionId,
    planId: decision.planId,
    routeId: route.routeId,
    dataMode: "DEMO",
    rendererMode: "DEMO_TWO_POINT_FIVE_D",
    verticalExaggeration: 1.5,
    samples: route.points.map((point, index) => ({
      routePointId: `${route.routeId}-point-${String(index + 1).padStart(2, "0")}`,
      point,
      distanceFromStartMeters: distances[index],
      elevationMeters: elevations[index],
      slopePercent:
        index === 0
          ? 0
          : Number(
              (
                ((elevations[index] - elevations[index - 1]) /
                  (distances[index] - distances[index - 1])) *
                100
              ).toFixed(2),
            ),
      segmentKind: segmentKinds[index],
      provenance,
    })),
    decisionFacts: {
      timeToBreachMinutes: 52,
      breachStopOrdinal: 17,
      baselineMinimumBudget: 29.9,
      adjustedMinimumBudget: 47.2,
      restMinutes: 10,
      transferStopCount: 8,
      etaChangeMinutes: 8,
      riskFactors: ["RAIN", "SLOPE", "CONTINUOUS_WORK"],
    },
    generatedAt: fixture.evaluatedAt,
    provenance: [provenance],
  });
}

export type SpatialSceneModelValidation =
  | { valid: true }
  | {
      valid: false;
      code:
        | "NOT_DECISION_SCOPE"
        | "IDENTIFIER_MISMATCH"
        | "ROUTE_POINT_MISMATCH";
    };

export function validateSpatialSceneAgainstMapModel(
  scene: DecisionSpatialScene,
  model: MapRenderModel,
): SpatialSceneModelValidation {
  if (model.scope !== "DECISION" || !model.selectedDecision) {
    return { valid: false, code: "NOT_DECISION_SCOPE" };
  }
  const route = model.routes.find((candidate) => candidate.selected);
  if (
    model.selectedDecision.decisionId !== scene.decisionId ||
    model.selection.planId !== scene.planId ||
    route?.routeId !== scene.routeId
  ) {
    return { valid: false, code: "IDENTIFIER_MISMATCH" };
  }
  if (
    route.geographicPoints.length !== scene.samples.length ||
    route.geographicPoints.some((point, index) =>
      point.latitude !== scene.samples[index].point.latitude ||
      point.longitude !== scene.samples[index].point.longitude,
    )
  ) {
    return { valid: false, code: "ROUTE_POINT_MISMATCH" };
  }
  return { valid: true };
}
