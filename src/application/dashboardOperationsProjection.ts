import { bundledDailyOperationsPackage } from "../adapters/fixtures/syntheticOperationsPackage";
import type { DailyOperationsPackage } from "../domain/operations";
import {
  createDailyOperationsSnapshot,
  createOperationsTransferCapacity,
  evaluateOperationsFleet,
  loadCurrentDailyOperationsPackage,
} from "./operations";

export type DashboardOperationsStorage =
  | "D1"
  | "MEMORY_DEV"
  | "BUNDLED_FALLBACK";

export type DashboardCourierProjection = {
  id: string;
  name: string;
  currentScore: number;
  budget: number;
  area: string;
  completed: number;
  total: number;
  remaining: number;
  shift: string;
  mapX: number;
  mapY: number;
  criticalMinute: number | null;
  criticalStopOrdinal: number | null;
  hubId: string;
  hubLabel: string;
  vehicleId: string;
  decisionId?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  missingInputCount: number;
  transferRecipientCount: number;
  maxTransferStopCount: number;
};

export type DashboardHubProjection = {
  hubId: string;
  label: string;
  courierCount: number;
  remainingStopCount: number;
  mapX: number;
  mapY: number;
};

export type DashboardOperationsProjection = {
  schemaVersion: "dashboard-operations-projection-v1";
  packageId: string;
  operationDate: string;
  evaluatedAt: string;
  storage: DashboardOperationsStorage;
  sourceBundleId: string;
  couriers: DashboardCourierProjection[];
  hubs: DashboardHubProjection[];
};

const hubAnchors: Record<string, { x: number; y: number }> = {
  "demo-hub-01": { x: 54, y: 24 },
  "demo-hub-02": { x: 62, y: 72 },
  "demo-hub-03": { x: 25, y: 51 },
  "demo-hub-north": { x: 54, y: 24 },
  "demo-hub-south": { x: 62, y: 72 },
  "demo-hub-west": { x: 25, y: 51 },
};

const offsets = [
  { x: -10, y: -5 },
  { x: 0, y: -8 },
  { x: 10, y: -4 },
  { x: -12, y: 4 },
  { x: -3, y: 3 },
  { x: 8, y: 5 },
  { x: -8, y: 11 },
  { x: 3, y: 12 },
  { x: 13, y: 10 },
] as const;

function shiftTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function criticalStopOrdinal(
  record: DailyOperationsPackage["records"][number],
  stopId: string | undefined,
) {
  if (!stopId) return null;
  return record.plan.stops.find((stop) => stop.stopId === stopId)?.sequence ?? null;
}

export async function createDashboardOperationsProjection(
  operationsPackage: DailyOperationsPackage,
  options: {
    storage: DashboardOperationsStorage;
    sourceBundleId: string;
  },
): Promise<DashboardOperationsProjection> {
  const snapshot = await createDailyOperationsSnapshot(operationsPackage, {
    createdAt: operationsPackage.evaluatedAt,
  });
  const fleet = evaluateOperationsFleet(snapshot);
  const evaluationByCourier = new Map(
    fleet.evaluations.map((evaluation) => [evaluation.courierId, evaluation]),
  );
  const hubIndex = new Map<string, number>();
  const transferCapacityByCourier = new Map(
    fleet.supportQueue.map((queueItem) => [
      queueItem.courierId,
      createOperationsTransferCapacity(snapshot, fleet, queueItem),
    ] as const),
  );

  const couriers = operationsPackage.records.map((record) => {
    const evaluation = evaluationByCourier.get(record.courier.courierId);
    if (!evaluation) {
      throw new Error(`대시보드 평가가 없는 기사입니다: ${record.courier.courierId}`);
    }
    const index = hubIndex.get(record.hub.hubId) ?? 0;
    hubIndex.set(record.hub.hubId, index + 1);
    const anchor = hubAnchors[record.hub.hubId] ?? { x: 48, y: 48 };
    const offset = offsets[index % offsets.length];
    const breach = evaluation.safety.breach;
    const breachStopId = breach.status === "PREDICTED" ? breach.stopId : undefined;
    const criticalMinute =
      breach.status === "ALREADY_BREACHED"
        ? 0
        : breach.status === "PREDICTED"
          ? Math.round(breach.timeToBreachMinutes)
          : null;
    const transferCapacity = transferCapacityByCourier.get(
      record.courier.courierId,
    ) ?? { recipientCount: 0, maxStopCount: 0 };

    return {
      id: record.courier.courierId,
      name: record.courier.displayLabel,
      currentScore: evaluation.safety.currentBudget,
      budget:
        evaluation.safety.minimumForecastBudget ??
        evaluation.safety.currentBudget,
      area: record.plan.stops[0].coarseZone,
      completed: record.plan.completedStopCount,
      total: record.plan.totalStopCount,
      remaining: record.plan.remainingStopCount,
      shift: shiftTime(record.shift.startAt),
      mapX: anchor.x + offset.x,
      mapY: anchor.y + offset.y,
      criticalMinute,
      criticalStopOrdinal: criticalStopOrdinal(record, breachStopId),
      hubId: record.hub.hubId,
      hubLabel: record.hub.label,
      vehicleId: record.vehicle.vehicleId,
      decisionId: evaluation.decisionId,
      confidence: evaluation.safety.confidence,
      missingInputCount: evaluation.safety.missingInputs.length,
      transferRecipientCount: transferCapacity.recipientCount,
      maxTransferStopCount: transferCapacity.maxStopCount,
    } satisfies DashboardCourierProjection;
  });

  const hubs = [...new Set(couriers.map((courier) => courier.hubId))]
    .map((hubId) => {
      const members = couriers.filter((courier) => courier.hubId === hubId);
      return {
        hubId,
        label: members[0].hubLabel,
        courierCount: members.length,
        remainingStopCount: members.reduce(
          (total, courier) => total + courier.remaining,
          0,
        ),
        mapX:
          members.reduce((total, courier) => total + courier.mapX, 0) /
          members.length,
        mapY:
          members.reduce((total, courier) => total + courier.mapY, 0) /
          members.length,
      } satisfies DashboardHubProjection;
    })
    .sort((left, right) => left.hubId.localeCompare(right.hubId));

  return {
    schemaVersion: "dashboard-operations-projection-v1",
    packageId: operationsPackage.packageId,
    operationDate: operationsPackage.operationDate,
    evaluatedAt: operationsPackage.evaluatedAt,
    storage: options.storage,
    sourceBundleId: options.sourceBundleId,
    couriers,
    hubs,
  };
}

export async function loadDashboardOperationsProjection(
  signal?: AbortSignal,
): Promise<DashboardOperationsProjection> {
  const loaded = await loadCurrentDailyOperationsPackage(signal);
  if (loaded.status === "LOADED") {
    return createDashboardOperationsProjection(loaded.operationsPackage, {
      storage: loaded.storage,
      sourceBundleId: loaded.sourceBundleId,
    });
  }
  return createDashboardOperationsProjection(bundledDailyOperationsPackage, {
    storage: "BUNDLED_FALLBACK",
    sourceBundleId: "daily-operations-documents-2026-07-25-bundled-v1",
  });
}
