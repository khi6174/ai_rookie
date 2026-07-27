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
  customerNoticeDrafts: Record<string, CustomerNoticeDraft>;
};

export type CustomerNoticeDraft = {
  schemaVersion: "customer-notice-v1";
  noticeId: string;
  decisionId: string;
  stopId: string;
  appliedPlanVersion: string;
  generatedAt: string;
  channel: "ALIMTALK_PREVIEW";
  updatedEta: string;
  reasonCode: "SAFE_OPERATION_ADJUSTMENT";
  message: string;
  generationMode: "TEMPLATE";
  citationIds: string[];
  deliveryStatus: "PREVIEW_ONLY";
  provenance: Array<{
    kind: "DERIVED";
    sourceId: string;
    sourceLabel: string;
    collectedAt: string;
    validAt: string;
    transformedBy: string;
    parentSourceIds: string[];
    isDemo: true;
  }>;
  actualDeliverySent: false;
};

export function createDemoPlanStore(activePlan: ScenarioFixture): DemoPlanStore {
  return {
    activePlan: ScenarioFixtureSchema.parse(structuredClone(activePlan)),
    appliedDecisionVersions: {},
    pendingCustomerNoticeIds: {},
    customerNoticeDrafts: {},
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

  const noticeStops = proposedPlan.stops
    .filter(
      (stop) =>
        stop.planId === decision.baselinePlanId &&
        ["PENDING", "IN_PROGRESS", "DELAYED", "TRANSFERRED"].includes(
          stop.status,
        ),
    )
    .sort((left, right) => left.sequence - right.sequence);
  const noticeDrafts = Object.fromEntries(
    noticeIds.map((noticeId, index) => {
      const stop = noticeStops[index % noticeStops.length];
      if (!stop) {
        throw new Error("Customer notice draft requires an affected stop");
      }
      const etaLabel = stop.expectedArrivalAt.slice(11, 16);
      return [
        noticeId,
        {
          schemaVersion: "customer-notice-v1" as const,
          noticeId,
          decisionId: decision.decisionId,
          stopId: stop.stopId,
          appliedPlanVersion: proposedWorkload.planVersion,
          generatedAt: input.at,
          channel: "ALIMTALK_PREVIEW" as const,
          updatedEta: stop.expectedArrivalAt,
          reasonCode: "SAFE_OPERATION_ADJUSTMENT" as const,
          message: `안전운영 조정으로 합성 배송지 ${stop.stopId}의 예정 시간이 ${etaLabel}로 갱신되었습니다. 실제 메시지는 발송되지 않습니다.`,
          generationMode: "TEMPLATE" as const,
          citationIds: [stop.stopId, proposedWorkload.planVersion],
          deliveryStatus: "PREVIEW_ONLY" as const,
          provenance: [
            {
              kind: "DERIVED" as const,
              sourceId: noticeId,
              sourceLabel: "SafeRoute 합성 고객안내 템플릿",
              collectedAt: input.at,
              validAt: stop.expectedArrivalAt,
              transformedBy: "customer-notice-template-v1",
              parentSourceIds: [
                decision.decisionId,
                stop.stopId,
                proposedWorkload.planVersion,
              ],
              isDemo: true as const,
            },
          ],
          actualDeliverySent: false as const,
        },
      ];
    }),
  );
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
    customerNoticeDrafts: {
      ...input.store.customerNoticeDrafts,
      ...noticeDrafts,
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
  const invalidNoticeId = noticeIds.find((noticeId) => {
    const draft = store.customerNoticeDrafts[noticeId];
    return (
      !draft ||
      draft.decisionId !== decision.decisionId ||
      draft.appliedPlanVersion !== decision.appliedPlanVersion ||
      draft.deliveryStatus !== "PREVIEW_ONLY" ||
      draft.actualDeliverySent !== false
    );
  });
  if (invalidNoticeId) {
    throw new Error(
      `Customer notice draft is missing or invalid: ${invalidNoticeId}`,
    );
  }
  const nextDecision = recordCustomerNotices(decision, noticeIds, at);
  const nextStore: DemoPlanStore = {
    ...store,
    pendingCustomerNoticeIds: { ...store.pendingCustomerNoticeIds },
    customerNoticeDrafts: { ...store.customerNoticeDrafts },
  };
  delete nextStore.pendingCustomerNoticeIds[decision.decisionId];
  return { decision: nextDecision, store: nextStore };
}
