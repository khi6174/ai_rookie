import type {
  GeographicPoint,
  RiderCompactMapModel,
} from "../../adapters/maps";
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
  route: GeographicPoint[];
};

function normalizedSeed(seed: number) {
  return Math.abs(seed % 10_000) / 10_000;
}
export function createOperationsMapCouriers(
  operationsPackage: DailyOperationsPackage,
): OperationsMapCourier[] {
  return operationsPackage.records.map((record, index) => {
    const center = hubCenters[record.hub.hubId] ?? hubCenters["demo-hub-01"];
    const primary = normalizedSeed(record.seed);
    const secondary = normalizedSeed(record.seed * 37 + index * 101);
    const current = {
      latitude: Number(
        (center.latitude + (primary - 0.5) * 0.028).toFixed(7),
      ),
      longitude: Number(
        (center.longitude + (secondary - 0.5) * 0.032).toFixed(7),
      ),
    };
    const route = record.plan.stops.slice(0, 5).map((stop, stopIndex) => ({
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
    }));
    return {
      courierId: record.courier.courierId,
      completed: record.plan.completedStopCount,
      total: record.plan.totalStopCount,
      current,
      route,
    };
  });
}

export function createOperationsRiderMapModel(
  operationsPackage: DailyOperationsPackage,
  courierId: string,
): RiderCompactMapModel {
  const courier = createOperationsMapCouriers(operationsPackage).find(
    (item) => item.courierId === courierId,
  );
  if (!courier || courier.route.length < 2) {
    throw new Error(`Synthetic route is missing for ${courierId}`);
  }
  return {
    decisionId: `operations-map-${courierId}`,
    current: courier.current,
    rest: courier.route[1],
    next: courier.route.at(-1)!,
    path: [courier.current, ...courier.route],
  };
}
