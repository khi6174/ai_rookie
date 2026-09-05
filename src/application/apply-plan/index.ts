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
  const changedPlans = proposedPlan.workloads.filter((workload) =>
      workloadForPlan(activePlan, workload.planId)?.planVersion !== workload.planVersion,
    );
  const noticeTargets = changedPlans.flatMap((workload) => proposedPlan.stops
    .filter((stop) => stop.planId === workload.planId &&
      ["PENDING", "IN_PROGRESS", "DELAYED", "TRANSFERRED"].includes(stop.status))
    .map((stop) => ({ stop, workload })),
  );
  if (!noticeTargets.length || input.simulateFailure) {
    const reasonCode = noticeTargets.length
      ? "DEMO_PLAN_STORE_FAILURE"
      : "CUSTOMER_NOTICE_REQUEST_REQUIRED";
    return {
      status: "FAILED" as const,
      reasonCode,
      rollbackStatus: "UNCHANGED" as const,
      decision: transitionApplyOutcome(decision, {
        status: "APPLY_FAILED",
        at: input.at,
        reasonCode,
        evidenceIds: [proposedWorkload.planVersion],
      }),
      store: input.store,
    };
  }

  const noticeDrafts = Object.fromEntries(
    noticeTargets.map(({ stop, workload: stopWorkload }) => {
      const noticeId = `notice-${crypto.randomUUID()}`;
      // ScenarioFixtureSchema validates the courier reference.
      const courier = proposedPlan.couriers.find((item) => item.courierId === stop.assignedCourierId)!;
      const etaLabel = new Date(stop.expectedArrivalAt).toLocaleString("ko-KR", {
        timeZone: courier.timeZone,
        dateStyle: "medium", timeStyle: "short", hourCycle: "h23",
      });
      return [
        noticeId,
        {
          schemaVersion: "customer-notice-v1" as const,
          noticeId,
          decisionId: decision.decisionId,
          stopId: stop.stopId,
          appliedPlanVersion: stopWorkload.planVersion,
          generatedAt: input.at,
          channel: "ALIMTALK_PREVIEW" as const,
          updatedEta: stop.expectedArrivalAt,
          reasonCode: "SAFE_OPERATION_ADJUSTMENT" as const,
          message: `안전운영 조정 후 배송 예정: ${etaLabel} (${courier.timeZone}). 실제 메시지는 발송되지 않습니다.`,
          generationMode: "TEMPLATE" as const,
          citationIds: [stop.stopId, stopWorkload.planVersion],
          deliveryStatus: "PREVIEW_ONLY" as const,
          provenance: [
            {
              kind: "DERIVED" as const,
              sourceId: noticeId,
              sourceLabel: "SafeRoute 고객안내 시연",
              collectedAt: input.at,
              validAt: stop.expectedArrivalAt,
              transformedBy: "customer-notice-template-v2",
              parentSourceIds: [decision.decisionId, stop.stopId, stopWorkload.planVersion],
              isDemo: true as const,
            },
          ],
          actualDeliverySent: false as const,
        },
      ];
    }),
  );
  const noticeIds = Object.keys(noticeDrafts);
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
    const stop = store.activePlan.stops.find((item) => item.stopId === draft?.stopId);
    return (
      !draft ||
      !stop ||
      draft.decisionId !== decision.decisionId ||
      draft.appliedPlanVersion !== workloadForPlan(store.activePlan, stop.planId)?.planVersion ||
      draft.updatedEta !== stop.expectedArrivalAt ||
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
