import type {
  GeographicPoint,
  RiderCompactMapModel,
} from "../../adapters/maps";
import type { ScenarioFixture } from "../../domain/contracts";
import type { DailyOperationsPackage } from "../../domain/operations";

const hubCenters: Record<string, GeographicPoint> = {
  "demo-hub-01": { latitude: 37.5904, longitude: 127.0182 },
  "demo-hub-02": { latitude: 37.4731, longitude: 126.9637 },
  "demo-hub-03": { latitude: 37.5523, longitude: 126.8789 },
};

export type OperationsMapCourier = {
  courierId: string;
  completed: number;
  total: number;
  current: GeographicPoint;
};

export type OperationsRouteComparison = {
  baseline: ScenarioFixture["workloads"][number];
  active: ScenarioFixture["workloads"][number];
  mapModel: RiderCompactMapModel;
};

function normalizedSeed(seed: number) {
  return Math.abs(seed % 10_000) / 10_000;
}

function currentPointForRecord(
  record: DailyOperationsPackage["records"][number],
  index: number,
) {
  const center = hubCenters[record.hub.hubId] ?? hubCenters["demo-hub-01"];
  const primary = normalizedSeed(record.seed);
  const secondary = normalizedSeed(record.seed * 37 + index * 101);
  return {
    latitude: Number(
      (center.latitude + (primary - 0.5) * 0.028).toFixed(7),
    ),
    longitude: Number(
      (center.longitude + (secondary - 0.5) * 0.032).toFixed(7),
    ),
  };
}

function pointForRecordStop(
  record: DailyOperationsPackage["records"][number],
  current: GeographicPoint,
  stop: DailyOperationsPackage["records"][number]["plan"]["stops"][number],
  stopIndex: number,
) {
  return {
    latitude: Number(
      (
        current.latitude +
        (stopIndex + 1) * 0.0021 +
        ((record.seed + stop.sequence) % 3) * 0.0004
      ).toFixed(7),
    ),
    longitude: Number(
      (
        current.longitude +
        (stopIndex % 2 === 0 ? 1 : -1) *
          (0.0014 + stopIndex * 0.00035)
      ).toFixed(7),
    ),
  };
}

function createStopPointIndex(operationsPackage: DailyOperationsPackage) {
  return new Map(
    operationsPackage.records.flatMap((record, recordIndex) => {
      const current = currentPointForRecord(record, recordIndex);
      return record.plan.stops.map((stop, stopIndex) => [
        stop.stopId,
        pointForRecordStop(record, current, stop, stopIndex),
      ] as const);
    }),
  );
}

function findRoutePlan(fixture: ScenarioFixture, courierId: string) {
  return fixture.workloads.find(
    (item) => item.courierId === courierId,
  )!;
}

export function createOperationsRouteComparison(
  operationsPackage: DailyOperationsPackage,
  baselinePlan: ScenarioFixture,
  activePlan: ScenarioFixture,
  courierId: string,
): OperationsRouteComparison {
  const baseline = findRoutePlan(baselinePlan, courierId);
  const active = findRoutePlan(activePlan, courierId);
  const recordIndex = operationsPackage.records.findIndex(
    (record) => record.courier.courierId === courierId,
  );
  const record = operationsPackage.records[recordIndex]!;
  const current = currentPointForRecord(record, recordIndex);
  const pointByStopId = createStopPointIndex(operationsPackage);
  const path = [
    current,
    ...active.remainingStopIds.map((stopId) => pointByStopId.get(stopId)!),
  ];
  return {
    baseline,
    active,
    mapModel: {
      decisionId: "map",
      current,
      rest: path[2] ?? path[1],
      next: path.at(-1)!,
      path,
    },
  };
}

export function createOperationsMapCouriers(
  operationsPackage: DailyOperationsPackage,
): OperationsMapCourier[] {
  return operationsPackage.records.map((record, index) => {
    const current = currentPointForRecord(record, index);
    return {
      courierId: record.courier.courierId,
      completed: record.plan.completedStopCount,
      total: record.plan.totalStopCount,
      current,
    };
  });
}

export function createOperationsRiderMapModel(
  operationsPackage: DailyOperationsPackage,
  courierId: string,
): RiderCompactMapModel {
  const index = operationsPackage.records.findIndex(
    (item) => item.courier.courierId === courierId,
  );
  const record = operationsPackage.records[index]!;
  const current = currentPointForRecord(record, index);
  const route = record.plan.stops
    .slice(0, 5)
    .map((stop, stopIndex) =>
      pointForRecordStop(record, current, stop, stopIndex),
    );
  return {
    decisionId: `operations-map-${courierId}`,
    current,
    rest: route[1],
    next: route.at(-1)!,
    path: [current, ...route],
  };
}
