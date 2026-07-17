import {
  DecisionRecordSchema,
  ScenarioFixtureSchema,
  type DecisionRecord,
  type ScenarioFixture,
} from "../../domain/contracts";
import {
  recordCustomerNotices,
  transitionApplyOutcome,
} from "../../domain/decisions";

export type DemoPlanStore = {
  activePlan: ScenarioFixture;
  appliedDecisionVersions: Record<string, string>;
  pendingCustomerNoticeIds: Record<string, string[]>;
};

export function createDemoPlanStore(activePlan: ScenarioFixture): DemoPlanStore {
  return {
    activePlan: ScenarioFixtureSchema.parse(structuredClone(activePlan)),
    appliedDecisionVersions: {},
    pendingCustomerNoticeIds: {},
  };
}

function workloadForPlan(plan: ScenarioFixture, planId: string) {
  return plan.workloads.find((workload) => workload.planId === planId);
}

export function applyPlanAtomically(input: {
  decision: DecisionRecord;
  store: DemoPlanStore;
  proposedPlan: ScenarioFixture;
  customerNoticeRequestIds: string[];
  at: string;
  simulateFailure?: boolean;
}) {
  const decision = DecisionRecordSchema.parse(input.decision);
  const activePlan = ScenarioFixtureSchema.parse(input.store.activePlan);
  const proposedPlan = ScenarioFixtureSchema.parse(input.proposedPlan);
  const existingVersion = input.store.appliedDecisionVersions[decision.decisionId];
  if (existingVersion) {
    return {
      status: "ALREADY_APPLIED" as const,
      decision: transitionApplyOutcome(decision, {
        status: "APPLIED",
        at: input.at,
        reasonCode: "PLAN_APPLY_IDEMPOTENT_REPLAY",
        appliedPlanVersion: existingVersion,
        evidenceIds: [existingVersion],
      }),
      store: input.store,
    };
  }

  const currentWorkload = workloadForPlan(activePlan, decision.baselinePlanId);
  const proposedWorkload = workloadForPlan(proposedPlan, decision.baselinePlanId);
  if (
    !currentWorkload ||
    currentWorkload.planVersion !== decision.baselinePlanVersion
  ) {
    return {
      status: "REVALIDATION_REQUIRED" as const,
      reasonCode: "STALE_PLAN_VERSION",
      decision: transitionApplyOutcome(decision, {
        status: "REVALIDATION_REQUIRED",
        at: input.at,
        reasonCode: "STALE_PLAN_VERSION",
        evidenceIds: currentWorkload ? [currentWorkload.planVersion] : [],
      }),
      store: input.store,
    };
  }
  if (
    !proposedWorkload ||
    proposedWorkload.planVersion !== decision.versionContext.planVersion ||
    proposedPlan.fixtureId !== activePlan.fixtureId ||
    proposedPlan.fixtureVersion !== activePlan.fixtureVersion
  ) {
    return {
      status: "REVALIDATION_REQUIRED" as const,
      reasonCode: "PROPOSED_PLAN_CONTEXT_MISMATCH",
      decision: transitionApplyOutcome(decision, {
        status: "REVALIDATION_REQUIRED",
        at: input.at,
        reasonCode: "PROPOSED_PLAN_CONTEXT_MISMATCH",
        evidenceIds: proposedWorkload ? [proposedWorkload.planVersion] : [],
      }),
      store: input.store,
    };
  }
  const noticeIds = [...new Set(input.customerNoticeRequestIds)];
  if (!noticeIds.length) {
    return {
      status: "FAILED" as const,
      reasonCode: "CUSTOMER_NOTICE_REQUEST_REQUIRED",
      rollbackStatus: "UNCHANGED" as const,
      decision: transitionApplyOutcome(decision, {
        status: "APPLY_FAILED",
        at: input.at,
        reasonCode: "CUSTOMER_NOTICE_REQUEST_REQUIRED",
      }),
      store: input.store,
    };
  }
  if (input.simulateFailure) {
    return {
      status: "FAILED" as const,
      reasonCode: "DEMO_PLAN_STORE_FAILURE",
      rollbackStatus: "UNCHANGED" as const,
      decision: transitionApplyOutcome(decision, {
        status: "APPLY_FAILED",
        at: input.at,
        reasonCode: "DEMO_PLAN_STORE_FAILURE",
        evidenceIds: [proposedWorkload.planVersion],
      }),
      store: input.store,
    };
  }

  const nextStore: DemoPlanStore = {
    activePlan: structuredClone(proposedPlan),
    appliedDecisionVersions: {
      ...input.store.appliedDecisionVersions,
      [decision.decisionId]: proposedWorkload.planVersion,
    },
    pendingCustomerNoticeIds: {
      ...input.store.pendingCustomerNoticeIds,
      [decision.decisionId]: noticeIds,
    },
  };
  return {
    status: "APPLIED" as const,
    decision: transitionApplyOutcome(decision, {
      status: "APPLIED",
      at: input.at,
      reasonCode: "PLAN_APPLIED_ATOMICALLY",
      appliedPlanVersion: proposedWorkload.planVersion,
      evidenceIds: [proposedWorkload.planVersion, ...noticeIds],
    }),
    store: nextStore,
  };
}

export function recordPendingCustomerNotices(
  rawDecision: DecisionRecord,
  store: DemoPlanStore,
  at: string,
) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  const noticeIds = store.pendingCustomerNoticeIds[decision.decisionId] ?? [];
  const nextDecision = recordCustomerNotices(decision, noticeIds, at);
  const nextStore: DemoPlanStore = {
    ...store,
    pendingCustomerNoticeIds: { ...store.pendingCustomerNoticeIds },
  };
  delete nextStore.pendingCustomerNoticeIds[decision.decisionId];
  return { decision: nextDecision, store: nextStore };
}
