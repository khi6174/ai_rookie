import type {
  DecisionRecord,
  InterventionCandidate,
  InterventionEvaluation,
} from "../../domain/contracts";
import {
  applyPlanAtomically,
  createDemoPlanStore,
  recordPendingCustomerNotices,
  type DemoPlanStore,
} from "../apply-plan";
import {
  beginRevalidation,
  completeRevalidation,
  createDecisionRecord,
  recordAdminDecision,
  recordCourierResponse,
  recordEvaluatedCandidates,
  recordGeneratedCandidates,
  requestCourierReview,
  requestAdminApproval,
  resumeAdminReview,
  startCourierResponses,
} from "../../domain/decisions";
import {
  createReorderCandidate,
  createRestCandidate,
  createSafeDelayCandidate,
  createSaferRouteCandidate,
  createTransferCandidate,
  evaluateIntervention,
  materializeInterventionPlan,
  rankInterventions,
} from "../../domain/interventions";
import type { DailyOperationsSnapshot } from "../../domain/operations";
import type {
  FleetEvaluation,
  SupportQueueItem,
} from "./evaluateFleet";

export type OperationsDecisionArtifacts = {
  queueItem: SupportQueueItem;
  decision: DecisionRecord;
  candidates: InterventionCandidate[];
  evaluations: InterventionEvaluation[];
  selectedCandidate: InterventionCandidate;
  selectedEvaluation: InterventionEvaluation;
  baselinePlanVersions: Record<string, string>;
};

export type OperationsDecisionWorkspace = {
  schemaVersion: "operations-decision-workspace-v1";
  snapshotId: string;
  snapshotVersion: string;
  createdAt: string;
  supportQueue: SupportQueueItem[];
  decisions: OperationsDecisionArtifacts[];
  store: DemoPlanStore;
};

export type DecisionWorkspaceConflict = {
  conflictId: string;
  decisionIds: [string, string];
  sharedCourierIds: string[];
  sharedStopIds: string[];
  reasonCodes: Array<
    "AFFECTED_COURIER_OVERLAP" | "AFFECTED_STOP_OVERLAP" | "PLAN_VERSION_OVERLAP"
  >;
};

function atSequence(base: string, seconds: number) {
  return new Date(Date.parse(base) + seconds * 1_000).toISOString();
}

function deterministicReorder(
  snapshot: DailyOperationsSnapshot,
  courierId: string,
) {
  const workload = snapshot.fixture.workloads.find(
    (item) => item.courierId === courierId,
  );
  const policy = snapshot.fixture.interventionInputs?.reorderPolicies.find(
    (item) => item.courierId === courierId,
  );
  if (!workload || !policy) return undefined;
  const baseline = [...workload.remainingStopIds];
  const movableStairStops = snapshot.fixture.stops
    .filter(
      (stop) =>
        stop.assignedCourierId === courierId &&
        stop.access.elevator === "UNAVAILABLE" &&
        policy.reorderableStopIds.includes(stop.stopId),
    )
    .map((stop) => stop.stopId);
  const reordered = [
    ...movableStairStops,
    ...baseline.filter((stopId) => !movableStairStops.includes(stopId)),
  ];
  for (const fixedStopId of policy.fixedStopIds) {
    const targetIndex = baseline.indexOf(fixedStopId);
    const currentIndex = reordered.indexOf(fixedStopId);
    if (targetIndex < 0 || currentIndex < 0) continue;
    reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, fixedStopId);
  }
  return reordered;
}

function selectTransferRecipient(
  snapshot: DailyOperationsSnapshot,
  fleet: FleetEvaluation,
  sourceCourierId: string,
) {
  const fleetByCourier = new Map(
    fleet.evaluations.map((evaluation) => [
      evaluation.courierId,
      evaluation,
    ]),
  );
  return [...snapshot.fixture.workloads]
    .filter((workload) => workload.courierId !== sourceCourierId)
    .sort((left, right) => {
      const leftEvaluation = fleetByCourier.get(left.courierId);
      const rightEvaluation = fleetByCourier.get(right.courierId);
      const stateOrder = {
        STABLE: 0,
        MONITOR: 1,
        SUPPORT_NEEDED: 2,
        BREACHED: 3,
        INSUFFICIENT_DATA: 4,
      };
      const stateDifference =
        stateOrder[leftEvaluation?.supportState ?? "INSUFFICIENT_DATA"] -
        stateOrder[rightEvaluation?.supportState ?? "INSUFFICIENT_DATA"];
      if (stateDifference !== 0) return stateDifference;
      const budgetDifference =
        (rightEvaluation?.safety.currentBudget ?? 0) -
        (leftEvaluation?.safety.currentBudget ?? 0);
      if (budgetDifference !== 0) return budgetDifference;
      if (
        left.remainingLoad.stopCount !== right.remainingLoad.stopCount
      ) {
        return (
          left.remainingLoad.stopCount - right.remainingLoad.stopCount
        );
      }
      return left.courierId.localeCompare(right.courierId);
    })
    .at(0)?.courierId;
}

function createCandidates(
  snapshot: DailyOperationsSnapshot,
  fleet: FleetEvaluation,
  queueItem: SupportQueueItem,
) {
  const fixture = snapshot.fixture;
  const decisionId = queueItem.decisionId;
  const courierId = queueItem.courierId;
  const workload = fixture.workloads.find(
    (item) => item.courierId === courierId,
  );
  if (!workload) {
    throw new Error(`Missing workload for ${courierId}`);
  }

  const candidates: InterventionCandidate[] = [
    createRestCandidate(fixture, decisionId, courierId, 15),
  ];
  const reorder = deterministicReorder(snapshot, courierId);
  if (reorder) {
    candidates.push(
      createReorderCandidate(fixture, decisionId, courierId, reorder),
    );
  }
  const saferRoute =
    fixture.interventionInputs?.saferRouteAlternatives.find(
      (item) => item.courierId === courierId,
    );
  if (saferRoute) {
    candidates.push(
      createSaferRouteCandidate(
        fixture,
        decisionId,
        courierId,
        saferRoute.replacementRouteId,
        saferRoute.replacedSegmentIds,
      ),
    );
  }
  const delayPolicy =
    fixture.interventionInputs?.safeDelayPolicies.find(
      (item) => item.courierId === courierId,
    );
  if (delayPolicy?.delayableStopIds.length) {
    candidates.push(
      createSafeDelayCandidate(
        fixture,
        decisionId,
        courierId,
        delayPolicy.delayableStopIds.slice(0, 3),
        atSequence(fixture.evaluatedAt, 45 * 60),
      ),
    );
  }
  const recipientCourierId = selectTransferRecipient(
    snapshot,
    fleet,
    courierId,
  );
  if (recipientCourierId && workload.remainingStopIds.length >= 4) {
    candidates.push(
      createTransferCandidate(fixture, decisionId, {
        sourceCourierId: courierId,
        recipientCourierId,
        stopIds: workload.remainingStopIds.slice(-4),
      }),
    );
  }
  return candidates;
}

export function createOperationsTransferCapacity(
  snapshot: DailyOperationsSnapshot,
  fleet: FleetEvaluation,
  queueItem: SupportQueueItem,
) {
  const workload = snapshot.fixture.workloads.find(
    (item) => item.courierId === queueItem.courierId,
  );
  const recipientCourierId = selectTransferRecipient(
    snapshot,
    fleet,
    queueItem.courierId,
  );
  if (!workload || !recipientCourierId || workload.remainingStopIds.length < 4) {
    return { recipientCount: 0, maxStopCount: 0 };
  }
  const candidate = createTransferCandidate(snapshot.fixture, queueItem.decisionId, {
    sourceCourierId: queueItem.courierId,
    recipientCourierId,
    stopIds: workload.remainingStopIds.slice(-4),
  });
  const evaluation = evaluateIntervention(snapshot.fixture, candidate);
  const transfer = candidate.actions.find(
    (action) => action.type === "TRANSFER_STOPS",
  );
  return evaluation.feasibility.status === "FEASIBLE"
    ? {
        recipientCount: 1,
        maxStopCount:
          transfer?.type === "TRANSFER_STOPS" ? transfer.stopIds.length : 0,
      }
    : { recipientCount: 0, maxStopCount: 0 };
}

export function createOperationsDecisionArtifacts(
  snapshot: DailyOperationsSnapshot,
  fleet: FleetEvaluation,
  queueItem: SupportQueueItem,
  decisionIndex: number,
): OperationsDecisionArtifacts {
  const candidates = createCandidates(snapshot, fleet, queueItem);
  const evaluations = rankInterventions(
    candidates.map((candidate) =>
      evaluateIntervention(snapshot.fixture, candidate),
    ),
  );
  const selectedEvaluation = evaluations.find(
    (evaluation) => evaluation.feasibility.status === "FEASIBLE",
  );
  if (!selectedEvaluation) {
    throw new Error(
      `Support decision ${queueItem.decisionId} has no feasible intervention`,
    );
  }
  const selectedCandidate = candidates.find(
    (candidate) =>
      candidate.candidateId === selectedEvaluation.candidateId,
  );
  if (!selectedCandidate) {
    throw new Error(
      `Selected candidate ${selectedEvaluation.candidateId} is missing`,
    );
  }

  const eventOffset = decisionIndex * 10;
  const workload = snapshot.fixture.workloads.find(
    (item) => item.courierId === queueItem.courierId,
  );
  if (!workload) {
    throw new Error(`Missing workload for ${queueItem.courierId}`);
  }
  const baseline = createDecisionRecord({
    decisionId: queueItem.decisionId,
    at: atSequence(snapshot.evaluatedAt, eventOffset),
    dataMode: "MOCK",
    baselinePlanId: workload.planId,
    baselinePlanVersion: workload.planVersion,
    baselineSnapshotIds: [selectedEvaluation.baselineSnapshotId],
    versionContext: selectedEvaluation.versionContext,
  });
  const generated = recordGeneratedCandidates(
    baseline,
    candidates,
    atSequence(snapshot.evaluatedAt, eventOffset + 1),
  );
  const evaluated = recordEvaluatedCandidates(
    generated,
    evaluations,
    selectedCandidate.candidateId,
    atSequence(snapshot.evaluatedAt, eventOffset + 2),
  );
  const review = requestCourierReview(
    evaluated,
    atSequence(snapshot.evaluatedAt, eventOffset + 3),
  );
  const decision = startCourierResponses(
    review,
    atSequence(snapshot.evaluatedAt, eventOffset + 4),
  );
  return {
    queueItem,
    decision,
    candidates,
    evaluations,
    selectedCandidate,
    selectedEvaluation,
    baselinePlanVersions: Object.fromEntries(
      selectedCandidate.affectedCourierIds.map((courierId) => {
        const affectedWorkload = snapshot.fixture.workloads.find(
          (item) => item.courierId === courierId,
        );
        if (!affectedWorkload) {
          throw new Error(`Missing affected workload for ${courierId}`);
        }
        return [courierId, affectedWorkload.planVersion];
      }),
    ),
  };
}

export function createOperationsDecisionWorkspace(
  snapshot: DailyOperationsSnapshot,
  fleet: FleetEvaluation,
): OperationsDecisionWorkspace {
  if (fleet.snapshotId !== snapshot.snapshotId) {
    throw new Error("Fleet evaluation belongs to another snapshot");
  }
  return {
    schemaVersion: "operations-decision-workspace-v1",
    snapshotId: snapshot.snapshotId,
    snapshotVersion: snapshot.snapshotVersion,
    createdAt: snapshot.createdAt,
    supportQueue: fleet.supportQueue,
    decisions: [],
    store: createDemoPlanStore(snapshot.fixture),
  };
}

export function initializeOperationsDecision(
  workspace: OperationsDecisionWorkspace,
  snapshot: DailyOperationsSnapshot,
  fleet: FleetEvaluation,
  decisionId: string,
): OperationsDecisionWorkspace {
  if (
    workspace.snapshotId !== snapshot.snapshotId ||
    fleet.snapshotId !== snapshot.snapshotId
  ) {
    throw new Error("Decision workspace snapshot context changed");
  }
  if (
    workspace.decisions.some(
      (artifacts) => artifacts.decision.decisionId === decisionId,
    )
  ) {
    return workspace;
  }
  const queueItem = workspace.supportQueue.find(
    (item) => item.decisionId === decisionId,
  );
  if (!queueItem) {
    throw new Error(`Unknown support decision ${decisionId}`);
  }
  const decisionIndex = workspace.supportQueue.findIndex(
    (item) => item.decisionId === decisionId,
  );
  return {
    ...workspace,
    decisions: [
      ...workspace.decisions,
      createOperationsDecisionArtifacts(
        snapshot,
        fleet,
        queueItem,
        decisionIndex,
      ),
    ],
  };
}

export function selectOperationsDecisionCandidate(
  workspace: OperationsDecisionWorkspace,
  input: { decisionId: string; candidateId: string },
) {
  return updateDecisionArtifacts(workspace, input.decisionId, (artifacts) => {
    if (
      artifacts.decision.status !== "RIDER_RESPONSE_PENDING" ||
      artifacts.decision.consentRequirements.some(
        (requirement) => requirement.required && requirement.status !== "PENDING",
      )
    ) {
      throw new Error("기사 확인 요청 이후에는 후보를 변경할 수 없습니다.");
    }
    const selectedCandidate = artifacts.candidates.find(
      (candidate) => candidate.candidateId === input.candidateId,
    );
    const selectedEvaluation = artifacts.evaluations.find(
      (evaluation) => evaluation.candidateId === input.candidateId,
    );
    if (
      !selectedCandidate ||
      !selectedEvaluation ||
      selectedEvaluation.feasibility.status !== "FEASIBLE"
    ) {
      throw new Error("실행 가능한 현재 decision 후보만 선택할 수 있습니다.");
    }

    const baseAt = artifacts.decision.createdAt;
    const baseline = createDecisionRecord({
      decisionId: artifacts.decision.decisionId,
      at: baseAt,
      dataMode: artifacts.decision.dataMode,
      baselinePlanId: artifacts.decision.baselinePlanId,
      baselinePlanVersion: artifacts.decision.baselinePlanVersion,
      baselineSnapshotIds: [selectedEvaluation.baselineSnapshotId],
      versionContext: selectedEvaluation.versionContext,
    });
    const generated = recordGeneratedCandidates(
      baseline,
      artifacts.candidates,
      atSequence(baseAt, 1),
    );
    const evaluated = recordEvaluatedCandidates(
      generated,
      artifacts.evaluations,
      selectedCandidate.candidateId,
      atSequence(baseAt, 2),
    );
    const review = requestCourierReview(evaluated, atSequence(baseAt, 3));
    const decision = startCourierResponses(review, atSequence(baseAt, 4));
    const baselinePlanVersions = Object.fromEntries(
      selectedCandidate.affectedCourierIds.map((courierId) => {
        const workload = workspace.store.activePlan.workloads.find(
          (item) => item.courierId === courierId,
        );
        if (!workload) {
          throw new Error(`Missing affected workload for ${courierId}`);
        }
        return [courierId, workload.planVersion];
      }),
    );
    return {
      ...artifacts,
      decision,
      selectedCandidate,
      selectedEvaluation,
      baselinePlanVersions,
    };
  });
}

export function detectDecisionWorkspaceConflicts(
  workspace: OperationsDecisionWorkspace,
  candidateSelections: Readonly<Record<string, string>> = {},
): DecisionWorkspaceConflict[] {
  const selections = workspace.decisions.map((artifacts) => {
    const candidateId =
      candidateSelections[artifacts.decision.decisionId] ??
      artifacts.selectedCandidate.candidateId;
    const candidate = artifacts.candidates.find(
      (item) => item.candidateId === candidateId,
    );
    if (!candidate) {
      throw new Error(
        `Unknown candidate ${candidateId} for ${artifacts.decision.decisionId}`,
      );
    }
    return { artifacts, candidate };
  });
  const conflicts: DecisionWorkspaceConflict[] = [];

  for (let leftIndex = 0; leftIndex < selections.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < selections.length;
      rightIndex += 1
    ) {
      const left = selections[leftIndex];
      const right = selections[rightIndex];
      const leftCouriers = new Set(left.candidate.affectedCourierIds);
      const leftStops = new Set(left.candidate.affectedStopIds);
      const sharedCourierIds = right.candidate.affectedCourierIds.filter(
        (courierId) => leftCouriers.has(courierId),
      );
      const sharedStopIds = right.candidate.affectedStopIds.filter((stopId) =>
        leftStops.has(stopId),
      );
      const samePlan =
        left.artifacts.decision.baselinePlanId ===
        right.artifacts.decision.baselinePlanId;
      const reasonCodes: DecisionWorkspaceConflict["reasonCodes"] = [];
      if (sharedCourierIds.length) {
        reasonCodes.push("AFFECTED_COURIER_OVERLAP");
      }
      if (sharedStopIds.length) {
        reasonCodes.push("AFFECTED_STOP_OVERLAP");
      }
      if (samePlan) {
        reasonCodes.push("PLAN_VERSION_OVERLAP");
      }
      if (!reasonCodes.length) continue;
      conflicts.push({
        conflictId: `conflict-${left.artifacts.decision.decisionId}-${right.artifacts.decision.decisionId}`,
        decisionIds: [
          left.artifacts.decision.decisionId,
          right.artifacts.decision.decisionId,
        ],
        sharedCourierIds,
        sharedStopIds,
        reasonCodes,
      });
    }
  }
  return conflicts;
}

function nextDecisionAt(decision: DecisionRecord, seconds = 1) {
  return atSequence(decision.updatedAt, seconds);
}

function updateDecisionArtifacts(
  workspace: OperationsDecisionWorkspace,
  decisionId: string,
  update: (artifacts: OperationsDecisionArtifacts) => OperationsDecisionArtifacts,
  store: DemoPlanStore = workspace.store,
) {
  let found = false;
  const decisions = workspace.decisions.map((artifacts) => {
    if (artifacts.decision.decisionId !== decisionId) return artifacts;
    found = true;
    return update(artifacts);
  });
  if (!found) throw new Error(`Decision ${decisionId} is not initialized`);
  return { ...workspace, decisions, store };
}

export function respondToOperationsDecision(
  workspace: OperationsDecisionWorkspace,
  input: {
    decisionId: string;
    courierId: string;
    response: "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED";
  },
) {
  return updateDecisionArtifacts(workspace, input.decisionId, (artifacts) => {
    let decision = recordCourierResponse(artifacts.decision, {
      courierId: input.courierId,
      actorId: input.courierId,
      response: input.response,
      at: nextDecisionAt(artifacts.decision),
    });
    if (decision.status === "RIDER_CONSENTED") {
      decision = requestAdminApproval(
        decision,
        nextDecisionAt(decision),
      );
    }
    return { ...artifacts, decision };
  });
}

export function holdOperationsDecision(
  workspace: OperationsDecisionWorkspace,
  decisionId: string,
) {
  return updateDecisionArtifacts(workspace, decisionId, (artifacts) => ({
    ...artifacts,
    decision: recordAdminDecision(artifacts.decision, {
      adminId: "admin-synthetic-operations",
      action: "HOLD",
      at: nextDecisionAt(artifacts.decision),
    }),
  }));
}

export function resumeHeldOperationsDecision(
  workspace: OperationsDecisionWorkspace,
  decisionId: string,
) {
  return updateDecisionArtifacts(workspace, decisionId, (artifacts) => ({
    ...artifacts,
    decision: resumeAdminReview(
      artifacts.decision,
      nextDecisionAt(artifacts.decision),
    ),
  }));
}

export type OperationsAlternativeRequestResult =
  | {
      status: "REGENERATED";
      workspace: OperationsDecisionWorkspace;
      previousCandidateId: string;
      selectedCandidateId: string;
    }
  | {
      status: "NO_SAFE_ALTERNATIVE";
      workspace: OperationsDecisionWorkspace;
      previousCandidateId: string;
    };

export function requestAlternativeOperationsDecision(
  workspace: OperationsDecisionWorkspace,
  snapshot: DailyOperationsSnapshot,
  decisionId: string,
): OperationsAlternativeRequestResult {
  let result:
    | {
        status: "REGENERATED";
        previousCandidateId: string;
        selectedCandidateId: string;
      }
    | {
        status: "NO_SAFE_ALTERNATIVE";
        previousCandidateId: string;
      }
    | undefined;
  const updated = updateDecisionArtifacts(workspace, decisionId, (artifacts) => {
    const previousCandidateId = artifacts.selectedCandidate.candidateId;
    let decision = recordAdminDecision(artifacts.decision, {
      adminId: "admin-synthetic-operations",
      action: "MODIFICATION_REQUESTED",
      at: nextDecisionAt(artifacts.decision),
    });
    const candidates = artifacts.candidates.filter(
      (candidate) => candidate.candidateId !== previousCandidateId,
    );
    const evaluations = rankInterventions(
      candidates.map((candidate) =>
        evaluateIntervention(snapshot.fixture, candidate),
      ),
    );
    const selectedEvaluation = evaluations.find(
      (evaluation) => evaluation.feasibility.status === "FEASIBLE",
    );
    const selectedCandidate = selectedEvaluation
      ? candidates.find(
          (candidate) => candidate.candidateId === selectedEvaluation.candidateId,
        )
      : undefined;
    if (!selectedEvaluation || !selectedCandidate) {
      result = { status: "NO_SAFE_ALTERNATIVE", previousCandidateId };
      return { ...artifacts, decision };
    }

    decision = recordGeneratedCandidates(
      decision,
      candidates,
      nextDecisionAt(decision),
    );
    decision = recordEvaluatedCandidates(
      decision,
      evaluations,
      selectedCandidate.candidateId,
      nextDecisionAt(decision),
    );
    decision = requestCourierReview(decision, nextDecisionAt(decision));
    decision = startCourierResponses(decision, nextDecisionAt(decision));
    const baselinePlanVersions = Object.fromEntries(
      selectedCandidate.affectedCourierIds.map((courierId) => {
        const workload = workspace.store.activePlan.workloads.find(
          (item) => item.courierId === courierId,
        );
        if (!workload) {
          throw new Error(`Missing affected workload for ${courierId}`);
        }
        return [courierId, workload.planVersion];
      }),
    );
    result = {
      status: "REGENERATED",
      previousCandidateId,
      selectedCandidateId: selectedCandidate.candidateId,
    };
    return {
      ...artifacts,
      decision,
      candidates,
      evaluations,
      selectedCandidate,
      selectedEvaluation,
      baselinePlanVersions,
    };
  });
  if (!result) {
    throw new Error(`Decision ${decisionId} alternative request did not finish`);
  }
  return { ...result, workspace: updated } as OperationsAlternativeRequestResult;
}

export type OperationsApplyResult = {
  status:
    | "APPLIED"
    | "ALREADY_APPLIED"
    | "REVALIDATION_REQUIRED"
    | "FAILED";
  workspace: OperationsDecisionWorkspace;
  reasonCode?: string;
};

export function approveAndApplyOperationsDecision(
  workspace: OperationsDecisionWorkspace,
  decisionId: string,
): OperationsApplyResult {
  const artifacts = workspace.decisions.find(
    (item) => item.decision.decisionId === decisionId,
  );
  if (!artifacts) {
    throw new Error(`Decision ${decisionId} is not initialized`);
  }

  let decision = recordAdminDecision(artifacts.decision, {
    adminId: "admin-synthetic-operations",
    action: "APPROVE",
    at: nextDecisionAt(artifacts.decision),
  });
  decision = beginRevalidation(decision, nextDecisionAt(decision));

  const changedAffectedCourierIds =
    artifacts.selectedCandidate.affectedCourierIds.filter((courierId) => {
      const currentWorkload = workspace.store.activePlan.workloads.find(
        (workload) => workload.courierId === courierId,
      );
      return (
        !currentWorkload ||
        currentWorkload.planVersion !==
          artifacts.baselinePlanVersions[courierId]
      );
    });

  const materialized = materializeInterventionPlan(
    workspace.store.activePlan,
    artifacts.selectedCandidate,
  );
  const sourcePlanVersion =
    workspace.store.activePlan.workloads.find(
      (workload) =>
        workload.planId === artifacts.decision.baselinePlanId,
    )?.planVersion ?? "missing-plan-version";
  const revalidationEvaluation =
    materialized.status === "MATERIALIZED"
      ? materialized.evaluation
      : artifacts.selectedEvaluation;
  const importantChanges = [
    ...(materialized.status === "MATERIALIZED"
      ? []
      : ["CURRENT_PLAN_NO_LONGER_FEASIBLE"]),
    ...changedAffectedCourierIds.map(
      (courierId) => `AFFECTED_PLAN_CHANGED:${courierId}`,
    ),
  ];
  decision = completeRevalidation(decision, {
    evaluation: revalidationEvaluation,
    currentPlanVersion: sourcePlanVersion,
    importantChanges,
    at: nextDecisionAt(decision),
  });
  if (
    decision.status === "REVALIDATION_REQUIRED" ||
    materialized.status !== "MATERIALIZED"
  ) {
    return {
      status: "REVALIDATION_REQUIRED",
      reasonCode:
        decision.events.at(-1)?.reasonCode ??
        "CURRENT_PLAN_NO_LONGER_FEASIBLE",
      workspace: updateDecisionArtifacts(
        workspace,
        decisionId,
        (current) => ({ ...current, decision }),
      ),
    };
  }

  const applied = applyPlanAtomically({
    decision,
    store: workspace.store,
    proposedPlan: materialized.plan,
    customerNoticeRequestIds: materialized.plan.stops
      .filter(
        (stop) =>
          stop.planId === decision.baselinePlanId &&
          ["PENDING", "IN_PROGRESS", "DELAYED", "TRANSFERRED"].includes(
            stop.status,
          ),
      )
      .sort((left, right) => left.sequence - right.sequence)
      .map((stop) => `notice-${decisionId}-${stop.stopId}`),
    at: nextDecisionAt(decision),
  });
  if (
    applied.status !== "APPLIED" &&
    applied.status !== "ALREADY_APPLIED"
  ) {
    return {
      status:
        applied.status === "REVALIDATION_REQUIRED"
          ? "REVALIDATION_REQUIRED"
          : "FAILED",
      reasonCode: applied.reasonCode,
      workspace: updateDecisionArtifacts(
        workspace,
        decisionId,
        (current) => ({ ...current, decision: applied.decision }),
        applied.store,
      ),
    };
  }

  const noticed = recordPendingCustomerNotices(
    applied.decision,
    applied.store,
    nextDecisionAt(applied.decision),
  );
  return {
    status: applied.status,
    workspace: updateDecisionArtifacts(
      workspace,
      decisionId,
      (current) => ({
        ...current,
        decision: noticed.decision,
        selectedEvaluation: materialized.evaluation,
        evaluations: current.evaluations.map((evaluation) =>
          evaluation.candidateId === materialized.evaluation.candidateId
            ? materialized.evaluation
            : evaluation,
        ),
      }),
      noticed.store,
    ),
  };
}
