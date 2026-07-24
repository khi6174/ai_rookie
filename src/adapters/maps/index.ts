import {
  MapSelectionSchema,
  type MapDecisionSummary,
  type MapSelection,
  type MultiRegionMapFixture,
} from "../../domain/contracts";
import { summarizeMultiRegionMapFixture } from "../fixtures";

export {
  createDecisionSpatialScene,
  spatialScenePerformanceBudget,
  validateSpatialSceneAgainstMapModel,
  type SpatialSceneModelValidation,
} from "./spatialScene";

export {
  KakaoDirectionsClientError,
  KakaoDirectionsPreviewSchema,
  createKakaoMapDemoDirectionsUrl,
  fetchKakaoDirectionsPreview,
  type KakaoDirectionsFallbackCode,
  type KakaoDirectionsPreview,
} from "./kakaoDirections";

export type ProjectedPoint = { x: number; y: number };
export type GeographicPoint = { latitude: number; longitude: number };

export type RegionMapNode = {
  regionId: string;
  label: string;
  point: ProjectedPoint;
  geographicPoint: GeographicPoint;
  courierCount: number;
  supportDecisionCount: number;
  staleOrOfflineCount: number;
};

export type HubMapNode = {
  hubId: string;
  regionId: string;
  label: string;
  point: ProjectedPoint;
  geographicPoint: GeographicPoint;
  courierCount: number;
};

export type CourierMapNode = {
  courierId: string;
  regionId: string;
  hubId: string;
  decisionId?: string;
  supportStatus: MultiRegionMapFixture["couriers"][number]["supportStatus"];
  positionStatus: MultiRegionMapFixture["couriers"][number]["position"]["status"];
  point?: ProjectedPoint;
  geographicPoint?: GeographicPoint;
};

export type RouteMapLine = {
  routeId: string;
  courierId: string;
  selected: boolean;
  points: ProjectedPoint[];
  geographicPoints: GeographicPoint[];
};

export type MapRenderModel = {
  scope: "NATIONAL" | "REGION" | "DECISION";
  selection: MapSelection;
  regions: RegionMapNode[];
  hubs: HubMapNode[];
  couriers: CourierMapNode[];
  routes: RouteMapLine[];
  featureBudget: {
    totalCouriers: number;
    visibleCouriers: number;
    totalRoutes: number;
    renderedRoutes: number;
    routesCapped: boolean;
  };
  selectedDecision?: MapDecisionSummary;
};

export const mapPerformanceBudget = Object.freeze({
  schemaVersion: "map-performance-budget-v1",
  loadProfiles: [24, 96, 240] as const,
  maxTotalCouriers: 240,
  maxVisibleRegionCouriers: 80,
  maxRenderedRegionRoutes: 24,
  minimumPositionIntervalSeconds: 5,
  maximumInitialMapReadyMs: 5_000,
  maximumRegionDrilldownMs: 1_000,
  maximumFrameUpdateMs: 1_000,
  maximumPanResponseMs: 500,
  maximumP95FrameGapMs: 100,
  maximumFrameGapMs: 250,
});

export type MapAdapter = {
  getModel(selection?: MapSelection): MapRenderModel;
  selectionForDecision(decisionId: string): MapSelection;
  resetSelection(): MapSelection;
};

export type RiderCompactMapModel = {
  decisionId: string;
  current: GeographicPoint;
  rest: GeographicPoint;
  next: GeographicPoint;
  path: GeographicPoint[];
};

export function createRiderCompactMapModel(
  adapter: MapAdapter,
  decisionId: string,
): RiderCompactMapModel {
  const model = adapter.getModel(adapter.selectionForDecision(decisionId));
  const courier = model.couriers[0];
  const route = model.routes.find((item) => item.selected) ?? model.routes[0];
  if (!courier?.geographicPoint || !route?.geographicPoints.length) {
    throw new Error(`Rider compact map has no current position or route: ${decisionId}`);
  }
  const routePoints = route.geographicPoints;
  return {
    decisionId,
    current: courier.geographicPoint,
    rest: routePoints[Math.min(1, routePoints.length - 1)],
    next: routePoints[routePoints.length - 1],
    path: [courier.geographicPoint, ...routePoints],
  };
}

function pointForPosition(
  position: MultiRegionMapFixture["couriers"][number]["position"],
) {
  if (position.status === "CURRENT") return position.observation.point;
  if (position.status === "STALE") return position.lastObservation.point;
  return undefined;
}

function createProjector(points: Array<{ latitude: number; longitude: number }>) {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.001);
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.001);

  return (point: { latitude: number; longitude: number }): ProjectedPoint => ({
    x: Number((8 + ((point.longitude - minLongitude) / longitudeSpan) * 84).toFixed(3)),
    y: Number((8 + ((maxLatitude - point.latitude) / latitudeSpan) * 84).toFixed(3)),
  });
}

function hasSelection(selection: MapSelection) {
  return Object.values(selection).some(Boolean);
}

export function createFixtureMapAdapter(
  fixture: MultiRegionMapFixture,
): MapAdapter {
  const summaries = summarizeMultiRegionMapFixture(fixture);

  const resolveSelection = (candidate: MapSelection = {}): MapSelection => {
    const selection = hasSelection(candidate)
      ? MapSelectionSchema.parse(candidate)
      : {};
    const decision = selection.decisionId
      ? fixture.decisions.find((item) => item.decisionId === selection.decisionId)
      : undefined;
    if (selection.decisionId && !decision) {
      throw new Error(`Unknown map decision: ${selection.decisionId}`);
    }
    const courier = decision
      ? fixture.couriers.find((item) => item.courierId === decision.courierId)
      : selection.courierId
        ? fixture.couriers.find((item) => item.courierId === selection.courierId)
        : undefined;
    if (selection.courierId && !courier) {
      throw new Error(`Unknown map courier: ${selection.courierId}`);
    }
    const regionId = courier?.regionId ?? selection.regionId;
    if (regionId && !fixture.regions.some((region) => region.regionId === regionId)) {
      throw new Error(`Unknown map region: ${regionId}`);
    }
    if (selection.regionId && regionId && selection.regionId !== regionId) {
      throw new Error("Map selection region does not match selected courier");
    }
    if (selection.planId && courier && selection.planId !== courier.planId) {
      throw new Error("Map selection plan does not match selected courier");
    }
    return {
      ...(regionId ? { regionId } : {}),
      ...(courier ? { hubId: courier.hubId, courierId: courier.courierId, planId: courier.planId } : {}),
      ...(decision ? { decisionId: decision.decisionId } : {}),
    };
  };

  return {
    getModel(candidate = {}) {
      const selection = resolveSelection(candidate);
      const selectedDecision = selection.decisionId
        ? fixture.decisions.find(
            (decision) => decision.decisionId === selection.decisionId,
          )
        : undefined;
      const scope = selectedDecision
        ? "DECISION"
        : selection.regionId
          ? "REGION"
          : "NATIONAL";
      const visibleCouriers = scope === "NATIONAL"
        ? []
        : fixture.couriers.filter((courier) =>
            scope === "DECISION"
              ? courier.courierId === selection.courierId
              : courier.regionId === selection.regionId,
          );
      const visibleCourierIds = new Set(
        visibleCouriers.map((courier) => courier.courierId),
      );
      const visibleHubs = scope === "NATIONAL"
        ? []
        : fixture.hubs.filter((hub) => hub.regionId === selection.regionId);
      const candidateRoutes = fixture.routes.filter((route) =>
        visibleCourierIds.has(route.courierId),
      );
      const visibleRoutes = scope === "REGION" && candidateRoutes.length > mapPerformanceBudget.maxRenderedRegionRoutes
        ? candidateRoutes.slice(0, mapPerformanceBudget.maxRenderedRegionRoutes)
        : candidateRoutes;
      const projectionPoints = scope === "NATIONAL"
        ? fixture.regions.map((region) => region.center)
        : [
            ...fixture.regions
              .filter((region) => region.regionId === selection.regionId)
              .map((region) => region.center),
            ...visibleHubs.map((hub) => hub.center),
            ...visibleCouriers.flatMap((courier) => {
              const point = pointForPosition(courier.position);
              return point ? [point] : [];
            }),
            ...visibleRoutes.flatMap((route) => route.points),
          ];
      const project = createProjector(projectionPoints);

      return {
        scope,
        selection,
        selectedDecision,
        regions: fixture.regions
          .filter((region) =>
            scope === "NATIONAL" ? true : region.regionId === selection.regionId,
          )
          .map((region) => {
          const summary = summaries.find((item) => item.regionId === region.regionId)!;
          return {
            regionId: region.regionId,
            label: region.label,
            point: project(region.center),
            geographicPoint: region.center,
            courierCount: summary.courierCount,
            supportDecisionCount: summary.supportDecisionCount,
            staleOrOfflineCount:
              summary.stalePositionCount + summary.offlinePositionCount,
          };
          }),
        hubs: visibleHubs.map((hub) => ({
                hubId: hub.hubId,
                regionId: hub.regionId,
                label: hub.label,
                point: project(hub.center),
                geographicPoint: hub.center,
                courierCount: hub.courierIds.length,
              })),
        couriers: visibleCouriers.map((courier) => ({
          courierId: courier.courierId,
          regionId: courier.regionId,
          hubId: courier.hubId,
          decisionId: courier.decisionId,
          supportStatus: courier.supportStatus,
          positionStatus: courier.position.status,
          point: pointForPosition(courier.position)
            ? project(pointForPosition(courier.position)!)
            : undefined,
          geographicPoint: pointForPosition(courier.position),
        })),
        routes: visibleRoutes.map((route) => ({
            routeId: route.routeId,
            courierId: route.courierId,
            selected: route.courierId === selection.courierId,
            points: route.points.map(project),
            geographicPoints: route.points,
          })),
        featureBudget: {
          totalCouriers: fixture.couriers.length,
          visibleCouriers: visibleCouriers.length,
          totalRoutes: candidateRoutes.length,
          renderedRoutes: visibleRoutes.length,
          routesCapped: candidateRoutes.length > visibleRoutes.length,
        },
      };
    },
    selectionForDecision(decisionId) {
      return resolveSelection({ decisionId });
    },
    resetSelection() {
      return {};
    },
  };
}
