import { describe, expect, it } from "vitest";
import { rainyHillyLongShiftFixture } from "../src/adapters/fixtures";
import {
  applyPlanAtomically,
  createDemoPlanStore,
  recordPendingCustomerNotices,
} from "../src/application/apply-plan";
import { DecisionRecordSchema } from "../src/domain/contracts";
import {
  DecisionCommandError,
  beginRevalidation,
  closeDecision,
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
} from "../src/domain/decisions";
import {
  createTransferCandidate,
  evaluateIntervention,
  materializeInterventionPlan,
} from "../src/domain/interventions";

const fixture = rainyHillyLongShiftFixture;
const decisionId = "decision-closed-loop-v1";
const sourceCourierId = fixture.couriers[0].courierId;
const recipientCourierId = fixture.couriers[1].courierId;
const transferredStopIds = fixture.stops.slice(-8).map((stop) => stop.stopId);
const candidate = createTransferCandidate(fixture, decisionId, {
  sourceCourierId,
  recipientCourierId,
  stopIds: transferredStopIds,
});
const reducedCandidate = createTransferCandidate(fixture, decisionId, {
  sourceCourierId,
  recipientCourierId,
  stopIds: fixture.stops.slice(-4).map((stop) => stop.stopId),
});
const evaluation = evaluateIntervention(fixture, candidate);
const materialized = materializeInterventionPlan(fixture, candidate);

const at = (minutes: number) =>
  new Date(Date.parse(fixture.evaluatedAt) + minutes * 60_000).toISOString();

function baselineDecision() {
  return createDecisionRecord({
    decisionId,
    at: at(0),
    dataMode: "MOCK",
    baselinePlanId: fixture.workloads[0].planId,
    baselinePlanVersion: fixture.workloads[0].planVersion,
    baselineSnapshotIds: [evaluation.baselineSnapshotId],
    versionContext: {
      ...evaluation.versionContext,
      planVersion: fixture.workloads[0].planVersion,
    },
  });
}

function decisionPendingConsent() {
  const generated = recordGeneratedCandidates(baselineDecision(), [candidate], at(1));
  const evaluated = recordEvaluatedCandidates(
    generated,
    [evaluation],
    candidate.candidateId,
    at(2),
  );
  const review = requestCourierReview(evaluated, at(3));
  return startCourierResponses(review, at(4));
}

function decisionWithAllConsent() {
  const sourceConsented = recordCourierResponse(decisionPendingConsent(), {
    courierId: sourceCourierId,
    actorId: sourceCourierId,
    response: "CONSENTED",
    at: at(5),
  });
  return recordCourierResponse(sourceConsented, {
    courierId: recipientCourierId,
    actorId: recipientCourierId,
    response: "CONSENTED",
    at: at(6),
  });
}

function decisionAwaitingAdmin() {
  return requestAdminApproval(decisionWithAllConsent(), at(7));
}

function decisionApplyingPlan() {
  const approved = recordAdminDecision(decisionAwaitingAdmin(), {
    adminId: "admin-demo-001",
    action: "APPROVE",
    at: at(8),
  });
  const revalidating = beginRevalidation(approved, at(9));
  return completeRevalidation(revalidating, {
    evaluation,
    currentPlanVersion: fixture.workloads[0].planVersion,
    at: at(9.5),
  });
}

function errorCode(action: () => unknown) {
  try {
    action();
    return undefined;
  } catch (error) {
    return error instanceof DecisionCommandError ? error.code : "UNEXPECTED_ERROR";
  }
}

describe("decision workflow happy path", () => {
  it("closes one immutable decision from two-party consent through atomic apply", () => {
    if (materialized.status !== "MATERIALIZED") {
      throw new Error("Expected a materialized feasible plan");
    }
    const beforeFixture = structuredClone(fixture);
    const applying = decisionApplyingPlan();
    const initialStore = createDemoPlanStore(fixture);
    const applied = applyPlanAtomically({
      decision: applying,
      store: initialStore,
      proposedPlan: materialized.plan,
      customerNoticeRequestIds: ["notice-request-001"],
      at: at(10),
    });
    expect(applied.status).toBe("APPLIED");
    expect(applied.store).not.toBe(initialStore);
    expect(initialStore.activePlan).toEqual(beforeFixture);
    expect(applied.decision.appliedPlanVersion).toBe(
      evaluation.versionContext.planVersion,
    );
    expect(
      applied.store.activePlan.stops
        .filter((stop) => transferredStopIds.includes(stop.stopId))
        .every((stop) => stop.assignedCourierId === recipientCourierId),
    ).toBe(true);

    const noticed = recordPendingCustomerNotices(
      applied.decision,
      applied.store,
      at(11),
    );
    const closed = closeDecision(noticed.decision, at(12));
    expect(DecisionRecordSchema.safeParse(closed).success).toBe(true);
    expect(closed.status).toBe("CLOSED");
    expect(closed.customerNoticeIds).toEqual(["notice-request-001"]);
    expect(closed.events.map((event) => event.toStatus)).toEqual([
      "BASELINE_EVALUATED",
      "CANDIDATES_GENERATED",
      "CANDIDATES_EVALUATED",
      "RIDER_REVIEW_REQUIRED",
      "RIDER_RESPONSE_PENDING",
      "RIDER_RESPONSE_PENDING",
      "RIDER_CONSENTED",
      "ADMIN_APPROVAL_REQUIRED",
      "APPROVED",
      "REVALIDATING",
      "APPLYING_PLAN",
      "APPLIED",
      "NOTICE_RECORDED",
      "CLOSED",
    ]);
    expect(new Set(closed.events.map((event) => event.eventId)).size).toBe(
      closed.events.length,
    );
    expect(fixture).toEqual(beforeFixture);
  });

  it("binds every consent and approval to the selected candidate", () => {
    const approved = recordAdminDecision(decisionAwaitingAdmin(), {
      adminId: "admin-demo-001",
      action: "APPROVE",
      at: at(8),
    });
    expect(
      approved.consentRequirements.every(
        (requirement) =>
          requirement.status === "CONSENTED" &&
          requirement.candidateId === approved.selectedCandidateId,
      ),
    ).toBe(true);
    expect(approved.approvedByAdminId).toBe("admin-demo-001");
    expect(approved.events.at(-1)).toEqual(
      expect.objectContaining({ actor: "ADMIN", actorId: "admin-demo-001" }),
    );
  });
});

describe("decision authority and consent boundaries", () => {
  it("rejects state skipping and a courier responding for another courier", () => {
    expect(
      errorCode(() =>
        recordAdminDecision(baselineDecision(), {
          adminId: "admin-demo-001",
          action: "APPROVE",
          at: at(1),
        }),
      ),
    ).toBe("DECISION_STATUS_NOT_ALLOWED");
    expect(
      errorCode(() =>
        recordCourierResponse(decisionPendingConsent(), {
          courierId: sourceCourierId,
          actorId: recipientCourierId,
          response: "CONSENTED",
          at: at(5),
        }),
      ),
    ).toBe("COURIER_ACTOR_MISMATCH");
  });

  it("keeps the decision pending after the first of two required consents", () => {
    const partial = recordCourierResponse(decisionPendingConsent(), {
      courierId: sourceCourierId,
      actorId: sourceCourierId,
      response: "CONSENTED",
      at: at(5),
    });
    expect(partial.status).toBe("RIDER_RESPONSE_PENDING");
    expect(partial.events.at(-1)).toEqual(
      expect.objectContaining({
        fromStatus: "RIDER_RESPONSE_PENDING",
        toStatus: "RIDER_RESPONSE_PENDING",
      }),
    );
  });

  it("expires consent at the exact ten-minute boundary and blocks approval", () => {
    const awaitingAdmin = decisionAwaitingAdmin();
    expect(
      errorCode(() =>
        recordAdminDecision(awaitingAdmin, {
          adminId: "admin-demo-001",
          action: "APPROVE",
          at: at(15),
        }),
      ),
    ).toBe("CONSENT_EXPIRED");
    const expired = expireConsents(awaitingAdmin, at(15));
    expect(expired.status).toBe("RIDER_CONSENT_EXPIRED");
    expect(
      expired.consentRequirements.find(
        (requirement) => requirement.courierId === sourceCourierId,
      )?.status,
    ).toBe("EXPIRED");
  });

  it("records modification and decline without auto-approval", () => {
    const modification = recordCourierResponse(decisionPendingConsent(), {
      courierId: sourceCourierId,
      actorId: sourceCourierId,
      response: "MODIFICATION_REQUESTED",
      at: at(5),
    });
    expect(modification.status).toBe("MODIFICATION_REQUESTED");
    expect(
      errorCode(() => recordGeneratedCandidates(modification, [candidate], at(6))),
    ).toBe("PREVIOUS_CANDIDATE_REUSE_NOT_ALLOWED");
    const regenerated = recordGeneratedCandidates(
      modification,
      [reducedCandidate],
      at(6),
    );
    expect(regenerated.selectedCandidateId).toBeUndefined();
    expect(regenerated.consentRequirements).toEqual([]);

    const declined = recordCourierResponse(decisionPendingConsent(), {
      courierId: sourceCourierId,
      actorId: sourceCourierId,
      response: "DECLINED",
      at: at(5),
    });
    expect(declined.status).toBe("RIDER_DECLINED");
    expect(declined.approvedByAdminId).toBeUndefined();
  });

  it("supports administrator hold and resume without changing the plan", () => {
    const held = recordAdminDecision(decisionAwaitingAdmin(), {
      adminId: "admin-demo-001",
      action: "HOLD",
      at: at(8),
    });
    expect(held.status).toBe("ADMIN_HELD");
    const resumed = resumeAdminReview(held, at(8.5));
    expect(resumed.status).toBe("ADMIN_APPROVAL_REQUIRED");
    expect(resumed.approvedByAdminId).toBeUndefined();
  });
});

describe("revalidation and atomic plan application", () => {
  it("returns to revalidation when the active plan version changed", () => {
    const approved = recordAdminDecision(decisionAwaitingAdmin(), {
      adminId: "admin-demo-001",
      action: "APPROVE",
      at: at(8),
    });
    const result = completeRevalidation(beginRevalidation(approved, at(9)), {
      evaluation,
      currentPlanVersion: "1.0.1-external-update",
      at: at(9.5),
    });
    expect(result.status).toBe("REVALIDATION_REQUIRED");
    expect(result.events.at(-1)?.reasonCode).toBe("STALE_PLAN_VERSION");
  });

  it("invalidates consent when the deterministic model context changes", () => {
    const approved = recordAdminDecision(decisionAwaitingAdmin(), {
      adminId: "admin-demo-001",
      action: "APPROVE",
      at: at(8),
    });
    const changedEvaluation = structuredClone(evaluation);
    changedEvaluation.versionContext.safetyConfigVersion = "dse-config-v1.0.1";
    const result = completeRevalidation(beginRevalidation(approved, at(9)), {
      evaluation: changedEvaluation,
      currentPlanVersion: fixture.workloads[0].planVersion,
      at: at(9.5),
    });
    expect(result.status).toBe("REVALIDATION_REQUIRED");
    expect(result.events.at(-1)?.reasonCode).toBe("CONSENT_CONTEXT_CHANGED");
  });

  it("does not change the store on an apply-time version race", () => {
    if (materialized.status !== "MATERIALIZED") {
      throw new Error("Expected a materialized feasible plan");
    }
    const applying = decisionApplyingPlan();
    const store = createDemoPlanStore(fixture);
    store.activePlan.workloads[0].planVersion = "1.0.1-external-update";
    const before = structuredClone(store);
    const result = applyPlanAtomically({
      decision: applying,
      store,
      proposedPlan: materialized.plan,
      customerNoticeRequestIds: ["notice-request-race"],
      at: at(10),
    });
    expect(result.status).toBe("REVALIDATION_REQUIRED");
    expect(result.store).toBe(store);
    expect(result.store).toEqual(before);
    expect(result.decision.status).toBe("REVALIDATION_REQUIRED");
  });

  it("rolls back an injected store failure without partial ETA or notices", () => {
    if (materialized.status !== "MATERIALIZED") {
      throw new Error("Expected a materialized feasible plan");
    }
    const applying = decisionApplyingPlan();
    const store = createDemoPlanStore(fixture);
    const before = structuredClone(store);
    const result = applyPlanAtomically({
      decision: applying,
      store,
      proposedPlan: materialized.plan,
      customerNoticeRequestIds: ["notice-request-failure"],
      at: at(10),
      simulateFailure: true,
    });
    expect(result.status).toBe("FAILED");
    expect(result.rollbackStatus).toBe("UNCHANGED");
    expect(result.store).toBe(store);
    expect(result.store).toEqual(before);
    expect(result.decision.status).toBe("APPLY_FAILED");
  });

  it("handles a duplicate decision idempotently without a second swap", () => {
    if (materialized.status !== "MATERIALIZED") {
      throw new Error("Expected a materialized feasible plan");
    }
    const applying = decisionApplyingPlan();
    const first = applyPlanAtomically({
      decision: applying,
      store: createDemoPlanStore(fixture),
      proposedPlan: materialized.plan,
      customerNoticeRequestIds: ["notice-request-idempotent"],
      at: at(10),
    });
    const replay = applyPlanAtomically({
      decision: applying,
      store: first.store,
      proposedPlan: materialized.plan,
      customerNoticeRequestIds: ["notice-request-idempotent"],
      at: at(10.5),
    });
    expect(replay.status).toBe("ALREADY_APPLIED");
    expect(replay.store).toBe(first.store);
    expect(replay.decision.appliedPlanVersion).toBe(
      first.decision.appliedPlanVersion,
    );
  });
});
