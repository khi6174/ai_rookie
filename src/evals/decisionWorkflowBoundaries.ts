import { rainyHillyLongShiftFixture } from "../adapters/fixtures";
import {
  applyPlanAtomically,
  createDemoPlanStore,
} from "../application/apply-plan";
import type { DecisionRecord, InterventionEvaluation } from "../domain/contracts";
import {
  DecisionCommandError,
  beginRevalidation,
  completeRevalidation,
  createDecisionRecord,
  expireConsents,
  recordAdminDecision,
  recordCourierResponse,
  recordEvaluatedCandidates,
  recordGeneratedCandidates,
  requestAdminApproval,
  requestCourierReview,
  resumeAdminReview,
  startCourierResponses,
} from "../domain/decisions";
import {
  createTransferCandidate,
  evaluateIntervention,
  materializeInterventionPlan,
} from "../domain/interventions";

export const decisionWorkflowBoundaryVersion = "decision-workflow-boundary-v1.0.0";

type BoundaryCategory = "TIME" | "CONSENT" | "VERSION";
type BoundaryOutcome = {
  outcome: string;
  reasonCode: string;
};
type BoundaryDefinition = {
  caseId: string;
  category: BoundaryCategory;
  boundary: string;
  expectedOutcome: string;
  expectedReasonCode: string;
  run: () => BoundaryOutcome;
};

const fixture = rainyHillyLongShiftFixture;
const decisionId = "decision-workflow-boundary-v1";
const sourceCourierId = fixture.couriers[0].courierId;
const recipientCourierId = fixture.couriers[1].courierId;
const baselinePlanVersion = fixture.workloads[0].planVersion;
const at = (minutes: number) =>
  new Date(Date.parse(fixture.evaluatedAt) + minutes * 60_000).toISOString();

const selectedCandidate = createTransferCandidate(fixture, decisionId, {
  sourceCourierId,
  recipientCourierId,
  stopIds: fixture.stops.slice(-8).map((stop) => stop.stopId),
});
const selectedEvaluation = evaluateIntervention(fixture, selectedCandidate);
const alternateCandidate = createTransferCandidate(fixture, decisionId, {
  sourceCourierId,
  recipientCourierId,
  stopIds: fixture.stops.slice(-4).map((stop) => stop.stopId),
});
const alternateEvaluation = evaluateIntervention(fixture, alternateCandidate);
const materialized = materializeInterventionPlan(fixture, selectedCandidate);

function baselineDecision() {
  return createDecisionRecord({
    decisionId,
    at: at(0),
    dataMode: "MOCK",
    baselinePlanId: fixture.workloads[0].planId,
    baselinePlanVersion,
    baselineSnapshotIds: [selectedEvaluation.baselineSnapshotId],
    versionContext: {
      ...selectedEvaluation.versionContext,
      planVersion: baselinePlanVersion,
    },
  });
}

function pendingConsentDecision() {
  const generated = recordGeneratedCandidates(
    baselineDecision(),
    [selectedCandidate],
    at(1),
  );
  const evaluated = recordEvaluatedCandidates(
    generated,
    [selectedEvaluation],
    selectedCandidate.candidateId,
    at(2),
  );
  return startCourierResponses(requestCourierReview(evaluated, at(3)), at(4));
}

function partiallyConsentedDecision() {
  return recordCourierResponse(pendingConsentDecision(), {
    courierId: sourceCourierId,
    actorId: sourceCourierId,
    response: "CONSENTED",
    at: at(5),
  });
}

function allConsentedDecision() {
  return recordCourierResponse(partiallyConsentedDecision(), {
    courierId: recipientCourierId,
    actorId: recipientCourierId,
    response: "CONSENTED",
    at: at(6),
  });
}

function awaitingAdminDecision() {
  return requestAdminApproval(allConsentedDecision(), at(7));
}

function approvedDecision(approvedAt = 8) {
  return recordAdminDecision(awaitingAdminDecision(), {
    adminId: "admin-boundary-001",
    action: "APPROVE",
    at: at(approvedAt),
  });
}

function applyingDecision() {
  return completeRevalidation(beginRevalidation(approvedDecision(), at(9)), {
    evaluation: selectedEvaluation,
    currentPlanVersion: baselinePlanVersion,
    at: at(9.5),
  });
}

function decisionOutcome(decision: DecisionRecord): BoundaryOutcome {
  return {
    outcome: decision.status,
    reasonCode: decision.events.at(-1)?.reasonCode ?? "",
  };
}

function commandOutcome(command: () => DecisionRecord): BoundaryOutcome {
  try {
    return decisionOutcome(command());
  } catch (error) {
    if (error instanceof DecisionCommandError) {
      return { outcome: `ERROR:${error.code}`, reasonCode: error.code };
    }
    throw error;
  }
}

function changedEvaluation(
  field: keyof InterventionEvaluation["versionContext"],
  value: string,
) {
  const changed = structuredClone(selectedEvaluation);
  changed.versionContext[field] = value;
  return changed;
}

function revalidationOutcome(input: {
  evaluation?: InterventionEvaluation;
  currentPlanVersion?: string;
  importantChanges?: string[];
  completedAt?: number;
}) {
  return decisionOutcome(
    completeRevalidation(beginRevalidation(approvedDecision(), at(9)), {
      evaluation: input.evaluation ?? selectedEvaluation,
      currentPlanVersion: input.currentPlanVersion ?? baselinePlanVersion,
      importantChanges: input.importantChanges,
      at: at(input.completedAt ?? 9.5),
    }),
  );
}

function applyOutcome(input: {
  activePlanVersion?: string;
  proposedPlanVersion?: string;
  replay?: boolean;
}): BoundaryOutcome {
  if (materialized.status !== "MATERIALIZED") {
    throw new Error("Expected the selected workflow candidate to materialize");
  }
  const store = createDemoPlanStore(fixture);
  if (input.activePlanVersion) {
    store.activePlan.workloads[0].planVersion = input.activePlanVersion;
  }
  const proposedPlan = structuredClone(materialized.plan);
  if (input.proposedPlanVersion) {
    const workload = proposedPlan.workloads.find(
      (item) => item.planId === fixture.workloads[0].planId,
    );
    if (!workload) throw new Error("Expected a source workload in proposed plan");
    workload.planVersion = input.proposedPlanVersion;
  }
  const first = applyPlanAtomically({
    decision: applyingDecision(),
    store,
    proposedPlan,
    customerNoticeRequestIds: ["notice-boundary-001"],
    at: at(10),
  });
  const result = input.replay
    ? applyPlanAtomically({
        decision: applyingDecision(),
        store: first.store,
        proposedPlan,
        customerNoticeRequestIds: ["notice-boundary-001"],
        at: at(10.5),
      })
    : first;
  return {
    outcome: result.status,
    reasonCode: result.decision.events.at(-1)?.reasonCode ?? "",
  };
}

const definitions: readonly BoundaryDefinition[] = [
  {
    caseId: "time-event-regression-rejected",
    category: "TIME",
    boundary: "latest event - 0.001 minute",
    expectedOutcome: "ERROR:DECISION_EVENT_TIME_REGRESSION",
    expectedReasonCode: "DECISION_EVENT_TIME_REGRESSION",
    run: () => commandOutcome(() =>
      recordGeneratedCandidates(baselineDecision(), [selectedCandidate], at(-0.001))),
  },
  {
    caseId: "time-equal-event-allowed",
    category: "TIME",
    boundary: "latest event timestamp exactly equal",
    expectedOutcome: "CANDIDATES_GENERATED",
    expectedReasonCode: "CANDIDATES_GENERATED",
    run: () => commandOutcome(() =>
      recordGeneratedCandidates(baselineDecision(), [selectedCandidate], at(0))),
  },
  {
    caseId: "time-consent-9m59s-not-expired",
    category: "TIME",
    boundary: "first consent age 9.999 minutes",
    expectedOutcome: "ERROR:CONSENT_NOT_EXPIRED",
    expectedReasonCode: "CONSENT_NOT_EXPIRED",
    run: () => commandOutcome(() => expireConsents(awaitingAdminDecision(), at(14.999))),
  },
  {
    caseId: "time-approve-9m59s-allowed",
    category: "TIME",
    boundary: "first consent age 9.999 minutes",
    expectedOutcome: "APPROVED",
    expectedReasonCode: "ADMIN_APPROVE",
    run: () => commandOutcome(() => recordAdminDecision(awaitingAdminDecision(), {
      adminId: "admin-boundary-001",
      action: "APPROVE",
      at: at(14.999),
    })),
  },
  {
    caseId: "time-approve-exact-10m-blocked",
    category: "TIME",
    boundary: "first consent age exactly 10 minutes",
    expectedOutcome: "ERROR:CONSENT_EXPIRED",
    expectedReasonCode: "CONSENT_EXPIRED",
    run: () => commandOutcome(() => recordAdminDecision(awaitingAdminDecision(), {
      adminId: "admin-boundary-001",
      action: "APPROVE",
      at: at(15),
    })),
  },
  {
    caseId: "time-expire-exact-10m",
    category: "TIME",
    boundary: "first consent age exactly 10 minutes",
    expectedOutcome: "RIDER_CONSENT_EXPIRED",
    expectedReasonCode: "CONSENT_EXPIRED",
    run: () => commandOutcome(() => expireConsents(awaitingAdminDecision(), at(15))),
  },
  {
    caseId: "time-revalidate-9m59s-allowed",
    category: "TIME",
    boundary: "revalidation before first consent expiry",
    expectedOutcome: "APPLYING_PLAN",
    expectedReasonCode: "REVALIDATION_PASSED",
    run: () => revalidationOutcome({ completedAt: 14.999 }),
  },
  {
    caseId: "time-revalidate-exact-10m-blocked",
    category: "TIME",
    boundary: "revalidation at first consent expiry",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "CONSENT_EXPIRED",
    run: () => revalidationOutcome({ completedAt: 15 }),
  },
  {
    caseId: "consent-admin-cannot-skip-flow",
    category: "CONSENT",
    boundary: "administrator approval from baseline",
    expectedOutcome: "ERROR:DECISION_STATUS_NOT_ALLOWED",
    expectedReasonCode: "DECISION_STATUS_NOT_ALLOWED",
    run: () => commandOutcome(() => recordAdminDecision(baselineDecision(), {
      adminId: "admin-boundary-001",
      action: "APPROVE",
      at: at(1),
    })),
  },
  {
    caseId: "consent-courier-actor-mismatch",
    category: "CONSENT",
    boundary: "recipient responds for source",
    expectedOutcome: "ERROR:COURIER_ACTOR_MISMATCH",
    expectedReasonCode: "COURIER_ACTOR_MISMATCH",
    run: () => commandOutcome(() => recordCourierResponse(pendingConsentDecision(), {
      courierId: sourceCourierId,
      actorId: recipientCourierId,
      response: "CONSENTED",
      at: at(5),
    })),
  },
  {
    caseId: "consent-unknown-courier-rejected",
    category: "CONSENT",
    boundary: "courier without requirement",
    expectedOutcome: "ERROR:CONSENT_RESPONSE_NOT_PENDING",
    expectedReasonCode: "CONSENT_RESPONSE_NOT_PENDING",
    run: () => commandOutcome(() => recordCourierResponse(pendingConsentDecision(), {
      courierId: "courier-not-required",
      actorId: "courier-not-required",
      response: "CONSENTED",
      at: at(5),
    })),
  },
  {
    caseId: "consent-first-of-two-keeps-pending",
    category: "CONSENT",
    boundary: "one of two mandatory consents",
    expectedOutcome: "RIDER_RESPONSE_PENDING",
    expectedReasonCode: "COURIER_CONSENTED",
    run: () => decisionOutcome(partiallyConsentedDecision()),
  },
  {
    caseId: "consent-duplicate-response-rejected",
    category: "CONSENT",
    boundary: "same courier responds twice",
    expectedOutcome: "ERROR:CONSENT_RESPONSE_NOT_PENDING",
    expectedReasonCode: "CONSENT_RESPONSE_NOT_PENDING",
    run: () => commandOutcome(() => recordCourierResponse(partiallyConsentedDecision(), {
      courierId: sourceCourierId,
      actorId: sourceCourierId,
      response: "CONSENTED",
      at: at(5.5),
    })),
  },
  {
    caseId: "consent-modification-stops-approval",
    category: "CONSENT",
    boundary: "source requests modification",
    expectedOutcome: "MODIFICATION_REQUESTED",
    expectedReasonCode: "COURIER_MODIFICATION_REQUESTED",
    run: () => commandOutcome(() => recordCourierResponse(pendingConsentDecision(), {
      courierId: sourceCourierId,
      actorId: sourceCourierId,
      response: "MODIFICATION_REQUESTED",
      at: at(5),
    })),
  },
  {
    caseId: "consent-decline-stops-approval",
    category: "CONSENT",
    boundary: "source declines",
    expectedOutcome: "RIDER_DECLINED",
    expectedReasonCode: "COURIER_DECLINED",
    run: () => commandOutcome(() => recordCourierResponse(pendingConsentDecision(), {
      courierId: sourceCourierId,
      actorId: sourceCourierId,
      response: "DECLINED",
      at: at(5),
    })),
  },
  {
    caseId: "consent-both-complete",
    category: "CONSENT",
    boundary: "two of two mandatory consents",
    expectedOutcome: "RIDER_CONSENTED",
    expectedReasonCode: "COURIER_CONSENTED",
    run: () => decisionOutcome(allConsentedDecision()),
  },
  {
    caseId: "consent-admin-request-before-complete",
    category: "CONSENT",
    boundary: "admin request after one consent",
    expectedOutcome: "ERROR:DECISION_STATUS_NOT_ALLOWED",
    expectedReasonCode: "DECISION_STATUS_NOT_ALLOWED",
    run: () => commandOutcome(() => requestAdminApproval(partiallyConsentedDecision(), at(6))),
  },
  {
    caseId: "consent-previous-candidate-reuse-blocked",
    category: "CONSENT",
    boundary: "regenerate same candidate after modification",
    expectedOutcome: "ERROR:PREVIOUS_CANDIDATE_REUSE_NOT_ALLOWED",
    expectedReasonCode: "PREVIOUS_CANDIDATE_REUSE_NOT_ALLOWED",
    run: () => {
      const modified = recordCourierResponse(pendingConsentDecision(), {
        courierId: sourceCourierId,
        actorId: sourceCourierId,
        response: "MODIFICATION_REQUESTED",
        at: at(5),
      });
      return commandOutcome(() =>
        recordGeneratedCandidates(modified, [selectedCandidate], at(6)));
    },
  },
  {
    caseId: "consent-admin-hold-preserves-review",
    category: "CONSENT",
    boundary: "administrator hold",
    expectedOutcome: "ADMIN_HELD",
    expectedReasonCode: "ADMIN_HOLD",
    run: () => commandOutcome(() => recordAdminDecision(awaitingAdminDecision(), {
      adminId: "admin-boundary-001",
      action: "HOLD",
      at: at(8),
    })),
  },
  {
    caseId: "consent-admin-resume-preserves-review",
    category: "CONSENT",
    boundary: "resume held review",
    expectedOutcome: "ADMIN_APPROVAL_REQUIRED",
    expectedReasonCode: "ADMIN_REVIEW_RESUMED",
    run: () => {
      const held = recordAdminDecision(awaitingAdminDecision(), {
        adminId: "admin-boundary-001",
        action: "HOLD",
        at: at(8),
      });
      return commandOutcome(() => resumeAdminReview(held, at(8.5)));
    },
  },
  {
    caseId: "version-active-plan-stale",
    category: "VERSION",
    boundary: "active plan version differs before revalidation",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "STALE_PLAN_VERSION",
    run: () => revalidationOutcome({ currentPlanVersion: "1.0.1-external" }),
  },
  {
    caseId: "version-safety-model-changed",
    category: "VERSION",
    boundary: "safety model version differs from consent",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "CONSENT_CONTEXT_CHANGED",
    run: () => revalidationOutcome({
      evaluation: changedEvaluation("safetyModelVersion", "dse-engine-v1.0.1"),
    }),
  },
  {
    caseId: "version-safety-config-changed",
    category: "VERSION",
    boundary: "safety config version differs from consent",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "CONSENT_CONTEXT_CHANGED",
    run: () => revalidationOutcome({
      evaluation: changedEvaluation("safetyConfigVersion", "dse-config-v1.0.1"),
    }),
  },
  {
    caseId: "version-intervention-policy-changed",
    category: "VERSION",
    boundary: "intervention policy differs from consent",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "CONSENT_CONTEXT_CHANGED",
    run: () => revalidationOutcome({
      evaluation: changedEvaluation("interventionPolicyVersion", "intervention-policy-v1.0.1"),
    }),
  },
  {
    caseId: "version-evaluation-plan-changed",
    category: "VERSION",
    boundary: "evaluation plan version differs from consent",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "CONSENT_CONTEXT_CHANGED",
    run: () => revalidationOutcome({
      evaluation: changedEvaluation("planVersion", "1.0.1-evaluation"),
    }),
  },
  {
    caseId: "version-candidate-mismatch",
    category: "VERSION",
    boundary: "revalidation evaluates another candidate",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "REVALIDATION_CANDIDATE_MISMATCH",
    run: () => revalidationOutcome({ evaluation: alternateEvaluation }),
  },
  {
    caseId: "version-important-input-changed",
    category: "VERSION",
    boundary: "important route input changed after consent",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "IMPORTANT_INPUT_CHANGED",
    run: () => revalidationOutcome({ importantChanges: ["route-segment-017"] }),
  },
  {
    caseId: "version-apply-time-plan-race",
    category: "VERSION",
    boundary: "active plan changes after revalidation",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "STALE_PLAN_VERSION",
    run: () => applyOutcome({ activePlanVersion: "1.0.1-external" }),
  },
  {
    caseId: "version-proposed-plan-context-mismatch",
    category: "VERSION",
    boundary: "proposed source workload version differs",
    expectedOutcome: "REVALIDATION_REQUIRED",
    expectedReasonCode: "PROPOSED_PLAN_CONTEXT_MISMATCH",
    run: () => applyOutcome({ proposedPlanVersion: "1.0.1-proposed" }),
  },
  {
    caseId: "version-idempotent-replay",
    category: "VERSION",
    boundary: "same decision applied twice",
    expectedOutcome: "ALREADY_APPLIED",
    expectedReasonCode: "PLAN_APPLY_IDEMPOTENT_REPLAY",
    run: () => applyOutcome({ replay: true }),
  },
] as const;

export const decisionWorkflowBoundaryInputs = definitions.map(
  ({ run: _run, ...definition }) => definition,
);

export function evaluateDecisionWorkflowBoundaries() {
  return definitions.map((definition) => {
    const actual = definition.run();
    return {
      caseId: definition.caseId,
      category: definition.category,
      boundary: definition.boundary,
      expectedOutcome: definition.expectedOutcome,
      actualOutcome: actual.outcome,
      expectedReasonCode: definition.expectedReasonCode,
      reasonCode: actual.reasonCode,
      passed:
        actual.outcome === definition.expectedOutcome &&
        actual.reasonCode === definition.expectedReasonCode,
    };
  });
}

export function evaluateDecisionWorkflowBoundarySuite() {
  const rows = evaluateDecisionWorkflowBoundaries();
  const categoryCounts = rows.reduce<Record<BoundaryCategory, number>>(
    (counts, row) => ({ ...counts, [row.category]: counts[row.category] + 1 }),
    { TIME: 0, CONSENT: 0, VERSION: 0 },
  );
  const reasonCodeCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.reasonCode] = (counts[row.reasonCode] ?? 0) + 1;
    return counts;
  }, {});
  return {
    schemaVersion: "decision-workflow-boundary-summary-v1",
    generatorVersion: decisionWorkflowBoundaryVersion,
    dataMode: "MOCK" as const,
    isDemo: true as const,
    caseCount: rows.length,
    categoryCounts,
    passedCount: rows.filter((row) => row.passed).length,
    failedCount: rows.filter((row) => !row.passed).length,
    reasonCodeCounts,
    allPassed: rows.every((row) => row.passed),
    rows,
  };
}
