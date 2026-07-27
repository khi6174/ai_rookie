import type { DailyOperationsSnapshot } from "../../domain/operations";
import type { FleetEvaluation } from "./evaluateFleet";
import type { OperationsDecisionWorkspace } from "./createDecisionWorkspace";

export type OperationsExportBundle = {
  schemaVersion: "operations-export-bundle-v1";
  generatedAt: string;
  snapshot: {
    snapshotId: string;
    snapshotVersion: string;
    packageId: string;
    packageHash: string;
    operationDate: string;
    evaluatedAt: string;
    dataMode: "SYNTHETIC";
  };
  summary: {
    courierCount: number;
    supportDecisionCount: number;
    initializedDecisionCount: number;
    completedDecisionCount: number;
  };
  decisions: Array<{
    decisionId: string;
    courierId: string;
    planId: string;
    status: string;
    selectedCandidateId: string;
    requiredCourierIds: string[];
    appliedPlanVersion?: string;
    customerNoticeIds: string[];
    events: Array<{
      eventId: string;
      at: string;
      actor: string;
      actorId?: string;
      fromStatus?: string;
      toStatus: string;
      reasonCode: string;
      evidenceIds: string[];
    }>;
  }>;
};

function csvCell(value: string | number | undefined) {
  const normalized = value === undefined ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}
export function createOperationsExportBundle(
  snapshot: DailyOperationsSnapshot,
  fleet: FleetEvaluation,
  workspace: OperationsDecisionWorkspace,
  generatedAt = new Date().toISOString(),
): OperationsExportBundle {
  if (
    fleet.snapshotId !== snapshot.snapshotId ||
    workspace.snapshotId !== snapshot.snapshotId
  ) {
    throw new Error("Operations export inputs must share one snapshot");
  }
  return {
    schemaVersion: "operations-export-bundle-v1",
    generatedAt,
    snapshot: {
      snapshotId: snapshot.snapshotId,
      snapshotVersion: snapshot.snapshotVersion,
      packageId: snapshot.packageId,
      packageHash: snapshot.packageHash,
      operationDate: snapshot.operationDate,
      evaluatedAt: snapshot.evaluatedAt,
      dataMode: "SYNTHETIC",
    },
    summary: {
      courierCount: fleet.courierCount,
      supportDecisionCount: fleet.supportDecisionCount,
      initializedDecisionCount: workspace.decisions.length,
      completedDecisionCount: workspace.decisions.filter((artifacts) =>
        ["NOTICE_RECORDED", "CLOSED"].includes(artifacts.decision.status),
      ).length,
    },
    decisions: workspace.decisions.map((artifacts) => ({
      decisionId: artifacts.decision.decisionId,
      courierId: artifacts.queueItem.courierId,
      planId: artifacts.queueItem.planId,
      status: artifacts.decision.status,
      selectedCandidateId: artifacts.selectedCandidate.candidateId,
      requiredCourierIds: artifacts.decision.consentRequirements
        .filter((requirement) => requirement.required)
        .map((requirement) => requirement.courierId),
      appliedPlanVersion: artifacts.decision.appliedPlanVersion,
      customerNoticeIds: artifacts.decision.customerNoticeIds,
      events: artifacts.decision.events.map((event) => ({
        eventId: event.eventId,
        at: event.at,
        actor: event.actor,
        actorId: event.actorId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        reasonCode: event.reasonCode,
        evidenceIds: event.evidenceIds,
      })),
    })),
  };
}

export function createAppliedPlanCsv(
  snapshot: DailyOperationsSnapshot,
  workspace: OperationsDecisionWorkspace,
) {
  if (workspace.snapshotId !== snapshot.snapshotId) {
    throw new Error("Plan export belongs to another snapshot");
  }
  const header = [
    "snapshot_id",
    "operation_date",
    "courier_id",
    "plan_id",
    "plan_version",
    "stop_id",
    "sequence",
    "eta",
    "coarse_area",
    "weight_kg",
    "status",
    "data_mode",
  ];
  const rows = workspace.store.activePlan.stops
    .filter((stop) =>
      ["PENDING", "IN_PROGRESS", "DELAYED", "TRANSFERRED"].includes(
        stop.status,
      ),
    )
    .sort((left, right) => {
      const courierDifference = left.assignedCourierId.localeCompare(
        right.assignedCourierId,
      );
      return courierDifference || left.sequence - right.sequence;
    })
    .map((stop) => {
      const workload = workspace.store.activePlan.workloads.find(
        (item) =>
          item.courierId === stop.assignedCourierId &&
          item.planId === stop.planId,
      );
      return [
        snapshot.snapshotId,
        snapshot.operationDate,
        stop.assignedCourierId,
        stop.planId,
        workload?.planVersion,
        stop.stopId,
        stop.sequence,
        stop.expectedArrivalAt,
        stop.areaId,
        stop.load.weightKg,
        stop.status,
        "SYNTHETIC",
      ];
    });
  return [header, ...rows]
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\r\n");
}

export function createAuditCsv(
  snapshot: DailyOperationsSnapshot,
  workspace: OperationsDecisionWorkspace,
) {
  if (workspace.snapshotId !== snapshot.snapshotId) {
    throw new Error("Audit export belongs to another snapshot");
  }
  const header = [
    "snapshot_id",
    "decision_id",
    "event_id",
    "at",
    "actor",
    "actor_id",
    "from_status",
    "to_status",
    "reason_code",
    "evidence_ids",
    "data_mode",
  ];
  const rows = workspace.decisions.flatMap((artifacts) =>
    artifacts.decision.events.map((event) => [
      snapshot.snapshotId,
      artifacts.decision.decisionId,
      event.eventId,
      event.at,
      event.actor,
      event.actorId,
      event.fromStatus,
      event.toStatus,
      event.reasonCode,
      event.evidenceIds.join("|"),
      "SYNTHETIC",
    ]),
  );
  return [header, ...rows]
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\r\n");
}
