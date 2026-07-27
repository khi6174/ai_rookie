import { bundledSyntheticOperationsRecords } from "../adapters/fixtures";
import {
  createDailyOperationsSnapshot,
  createOperationsDecisionWorkspace,
  evaluateOperationsFleet,
  initializeOperationsDecision,
} from "../application/operations";
import {
  DailyOperationsPackageSchema,
  type DailyOperationsPackage,
  type SyntheticOperationsParentRecord,
} from "../domain/operations";

export const operationsScaleProfiles = [24, 96, 240] as const;

function scaledRecord(
  source: SyntheticOperationsParentRecord,
  index: number,
): SyntheticOperationsParentRecord {
  const ordinal = String(index + 1).padStart(3, "0");
  const record = structuredClone(source);
  record.parentRecordId = `scale-parent-${ordinal}`;
  record.seed = 20_000 + index;
  record.provenance.sourceId = record.parentRecordId;
  record.courier.courierId = `scale-courier-${ordinal}`;
  record.courier.displayLabel = `합성 확장 기사 ${ordinal}`;
  record.vehicle.vehicleId = `scale-vehicle-${ordinal}`;
  record.shift.shiftId = `scale-shift-${ordinal}`;
  record.plan.planId = `scale-plan-${ordinal}`;
  record.plan.stops = record.plan.stops.map((stop, stopIndex) => ({
    ...stop,
    stopId: `scale-stop-${ordinal}-${String(stopIndex + 1).padStart(2, "0")}`,
  }));
  record.safetyObservation.observationId = `scale-observation-${ordinal}`;
  return record;
}
export function createScaledOperationsPackage(
  courierCount: number,
): DailyOperationsPackage {
  if (
    !Number.isInteger(courierCount) ||
    courierCount < 1 ||
    courierCount > 500
  ) {
    throw new Error("courierCount must be between 1 and 500");
  }
  return DailyOperationsPackageSchema.parse({
    schemaVersion: "daily-operations-package-v1",
    packageId: `daily-operations-scale-${courierCount}-v1`,
    operationDate: "2026-07-25",
    evaluatedAt: "2026-07-25T18:00:00+09:00",
    timeZone: "Asia/Seoul",
    dataMode: "SYNTHETIC",
    source: "USER_UPLOADED",
    records: Array.from({ length: courierCount }, (_, index) =>
      scaledRecord(
        bundledSyntheticOperationsRecords[
          index % bundledSyntheticOperationsRecords.length
        ],
        index,
      ),
    ),
  });
}

export async function runOperationsScaleEvaluation() {
  const profiles = [];
  for (const courierCount of operationsScaleProfiles) {
    const startedAt = performance.now();
    const operationsPackage = createScaledOperationsPackage(courierCount);
    const snapshot = await createDailyOperationsSnapshot(
      operationsPackage,
      {
        createdAt: "2026-07-27T03:00:00.000Z",
      },
    );
    const snapshotReadyMs = performance.now() - startedAt;
    const fleet = evaluateOperationsFleet(snapshot);
    const fleetReadyMs = performance.now() - startedAt;
    let workspace = createOperationsDecisionWorkspace(snapshot, fleet);
    for (const queueItem of fleet.supportQueue.slice(0, 3)) {
      workspace = initializeOperationsDecision(
        workspace,
        snapshot,
        fleet,
        queueItem.decisionId,
      );
    }
    const totalReadyMs = performance.now() - startedAt;
    const unsafeRecommendedCount = workspace.decisions.filter(
      (artifacts) =>
        artifacts.selectedEvaluation.feasibility.status !== "FEASIBLE",
    ).length;
    const maximumMs =
      courierCount === 24 ? 5_000 : courierCount === 96 ? 15_000 : 40_000;
    profiles.push({
      courierCount,
      stopCount: snapshot.fixture.stops.length,
      evaluatedCourierCount: fleet.courierCount,
      supportDecisionCount: fleet.supportDecisionCount,
      sampledDecisionCount: workspace.decisions.length,
      unsafeRecommendedCount,
      snapshotReadyMs: Math.round(snapshotReadyMs),
      fleetReadyMs: Math.round(fleetReadyMs),
      totalReadyMs: Math.round(totalReadyMs),
      maximumMs,
      passed:
        fleet.courierCount === courierCount &&
        unsafeRecommendedCount === 0 &&
        totalReadyMs <= maximumMs,
    });
  }
  return {
    schemaVersion: "operations-scale-evaluation-v1",
    dataMode: "SYNTHETIC",
    capturedAt: new Date().toISOString(),
    profiles,
    status: profiles.every((profile) => profile.passed)
      ? "PASSED"
      : "FAILED",
  };
}
