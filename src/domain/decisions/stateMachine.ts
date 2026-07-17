import {
  DecisionRecordSchema,
  InterventionCandidateSchema,
  InterventionEvaluationSchema,
  type DecisionRecord,
  type DecisionStatus,
  type InterventionCandidate,
  type InterventionEvaluation,
} from "../contracts";

const CONSENT_VALIDITY_MINUTES = 10;

type Actor = "SYSTEM" | "COURIER" | "ADMIN";

export class DecisionCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DecisionCommandError";
  }
}

function requireStatus(
  decision: DecisionRecord,
  allowed: DecisionStatus[],
  command: string,
) {
  if (!allowed.includes(decision.status)) {
    throw new DecisionCommandError(
      "DECISION_STATUS_NOT_ALLOWED",
      `${command} is not allowed from ${decision.status}`,
    );
  }
}

function ensureChronological(decision: DecisionRecord, at: string) {
  if (Date.parse(at) < Date.parse(decision.updatedAt)) {
    throw new DecisionCommandError(
      "DECISION_EVENT_TIME_REGRESSION",
      "Decision command time cannot precede the latest event",
    );
  }
}

function transition(
  rawDecision: DecisionRecord,
  input: {
    toStatus: DecisionStatus;
    at: string;
    actor: Actor;
    actorId?: string;
    reasonCode: string;
    evidenceIds?: string[];
    update?: (decision: DecisionRecord) => void;
  },
) {
  const decision = structuredClone(DecisionRecordSchema.parse(rawDecision));
  ensureChronological(decision, input.at);
  input.update?.(decision);
  decision.events.push({
    eventId: `${decision.decisionId}-event-${String(decision.events.length + 1).padStart(3, "0")}`,
    at: input.at,
    actor: input.actor,
    actorId: input.actorId,
    fromStatus: decision.status,
    toStatus: input.toStatus,
    reasonCode: input.reasonCode,
    evidenceIds: [...new Set(input.evidenceIds ?? [])],
  });
  decision.status = input.toStatus;
  decision.updatedAt = input.at;
  const parsed = DecisionRecordSchema.safeParse(decision);
  if (!parsed.success) {
    throw new DecisionCommandError(
      "DECISION_TRANSITION_INVALID",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  return parsed.data;
}

const unique = (values: string[]) => [...new Set(values)];

function sameStringSet(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    [...left].sort().join("|") === [...right].sort().join("|")
  );
}

function requiredConsentsAreComplete(decision: DecisionRecord) {
  return decision.consentRequirements.every(
    (requirement) => !requirement.required || requirement.status === "CONSENTED",
  );
}

function expiredConsentCourierIds(decision: DecisionRecord, at: string) {
  const consentRequestedAt = [...decision.events]
    .reverse()
    .find((event) => event.reasonCode === "CONSENT_REQUESTED")?.at;
  return decision.consentRequirements
    .filter((requirement) => {
      if (!requirement.required) return false;
      const startsAt = requirement.respondedAt ?? consentRequestedAt;
      return (
        startsAt !== undefined &&
        Date.parse(at) - Date.parse(startsAt) >=
          CONSENT_VALIDITY_MINUTES * 60_000
      );
    })
    .map((requirement) => requirement.courierId);
}

export function createDecisionRecord(input: {
  decisionId: string;
  at: string;
  dataMode: DecisionRecord["dataMode"];
  baselinePlanId: string;
  baselinePlanVersion: string;
  baselineSnapshotIds: string[];
  versionContext: DecisionRecord["versionContext"];
}) {
  return DecisionRecordSchema.parse({
    decisionId: input.decisionId,
    createdAt: input.at,
    updatedAt: input.at,
    status: "BASELINE_EVALUATED",
    dataMode: input.dataMode,
    baselinePlanId: input.baselinePlanId,
    baselinePlanVersion: input.baselinePlanVersion,
    baselineSnapshotIds: unique(input.baselineSnapshotIds),
    candidateIds: [],
    evaluationIds: [],
    consentRequirements: [],
    customerNoticeIds: [],
    versionContext: input.versionContext,
    events: [
      {
        eventId: `${input.decisionId}-event-001`,
        at: input.at,
        actor: "SYSTEM",
        toStatus: "BASELINE_EVALUATED",
        reasonCode: "BASELINE_EVALUATED",
        evidenceIds: unique(input.baselineSnapshotIds),
      },
    ],
  });
}

export function recordGeneratedCandidates(
  rawDecision: DecisionRecord,
  rawCandidates: InterventionCandidate[],
  at: string,
) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(
    decision,
    [
      "BASELINE_EVALUATED",
      "MODIFICATION_REQUESTED",
      "RIDER_DECLINED",
      "RIDER_CONSENT_EXPIRED",
      "ADMIN_MODIFICATION_REQUESTED",
      "REVALIDATION_REQUIRED",
    ],
    "recordGeneratedCandidates",
  );
  const candidates = rawCandidates.map((candidate) =>
    InterventionCandidateSchema.parse(candidate),
  );
  for (const candidate of candidates) {
    if (
      candidate.decisionId !== decision.decisionId ||
      candidate.baselinePlanId !== decision.baselinePlanId ||
      candidate.baselinePlanVersion !== decision.baselinePlanVersion
    ) {
      throw new DecisionCommandError(
        "CANDIDATE_DECISION_CONTEXT_MISMATCH",
        "Candidate does not belong to the decision baseline",
      );
    }
  }
  const candidateIds = unique(candidates.map((candidate) => candidate.candidateId));
  if (candidateIds.length !== candidates.length) {
    throw new DecisionCommandError(
      "DUPLICATE_CANDIDATE_ID",
      "Candidate IDs must be unique",
    );
  }
  if (
    [
      "MODIFICATION_REQUESTED",
      "RIDER_DECLINED",
      "ADMIN_MODIFICATION_REQUESTED",
    ].includes(decision.status) &&
    decision.selectedCandidateId &&
    candidateIds.includes(decision.selectedCandidateId)
  ) {
    throw new DecisionCommandError(
      "PREVIOUS_CANDIDATE_REUSE_NOT_ALLOWED",
      "Modification and decline branches require a new candidate",
    );
  }
  return transition(decision, {
    toStatus: "CANDIDATES_GENERATED",
    at,
    actor: "SYSTEM",
    reasonCode:
      decision.status === "BASELINE_EVALUATED"
        ? "CANDIDATES_GENERATED"
        : "CANDIDATES_REGENERATED",
    evidenceIds: candidateIds,
    update: (next) => {
      next.candidateIds = candidateIds;
      next.evaluationIds = [];
      delete next.selectedCandidateId;
      next.consentRequirements = [];
      delete next.approvedByAdminId;
      delete next.approvedAt;
      delete next.appliedPlanVersion;
      next.customerNoticeIds = [];
    },
  });
}

export function recordEvaluatedCandidates(
  rawDecision: DecisionRecord,
  rawEvaluations: InterventionEvaluation[],
  selectedCandidateId: string,
  at: string,
) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["CANDIDATES_GENERATED"], "recordEvaluatedCandidates");
  const evaluations = rawEvaluations.map((evaluation) =>
    InterventionEvaluationSchema.parse(evaluation),
  );
  if (
    evaluations.some(
      (evaluation) =>
        evaluation.decisionId !== decision.decisionId ||
        !decision.candidateIds.includes(evaluation.candidateId),
    ) ||
    !sameStringSet(
      decision.candidateIds,
      evaluations.map((evaluation) => evaluation.candidateId),
    )
  ) {
    throw new DecisionCommandError(
      "EVALUATION_SET_MISMATCH",
      "Every generated candidate requires one matching evaluation",
    );
  }
  const selected = evaluations.find(
    (evaluation) => evaluation.candidateId === selectedCandidateId,
  );
  if (!selected || selected.feasibility.status !== "FEASIBLE") {
    throw new DecisionCommandError(
      "SELECTED_CANDIDATE_NOT_FEASIBLE",
      "Selected candidate must have a feasible evaluation",
    );
  }
  return transition(decision, {
    toStatus: "CANDIDATES_EVALUATED",
    at,
    actor: "SYSTEM",
    reasonCode: "CANDIDATES_EVALUATED",
    evidenceIds: evaluations.map((evaluation) => evaluation.evaluationId),
    update: (next) => {
      next.evaluationIds = evaluations.map(
        (evaluation) => evaluation.evaluationId,
      );
      next.selectedCandidateId = selectedCandidateId;
      next.consentRequirements = structuredClone(selected.consentRequirements);
      next.versionContext = structuredClone(selected.versionContext);
    },
  });
}

export function requestCourierReview(rawDecision: DecisionRecord, at: string) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["CANDIDATES_EVALUATED"], "requestCourierReview");
  if (!decision.selectedCandidateId || !decision.consentRequirements.length) {
    throw new DecisionCommandError(
      "COURIER_REVIEW_CONTEXT_MISSING",
      "Courier review requires a selected candidate and consent requirements",
    );
  }
  return transition(decision, {
    toStatus: "RIDER_REVIEW_REQUIRED",
    at,
    actor: "SYSTEM",
    reasonCode: "RIDER_REVIEW_REQUIRED",
    evidenceIds: [decision.selectedCandidateId],
  });
}

export function startCourierResponses(rawDecision: DecisionRecord, at: string) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["RIDER_REVIEW_REQUIRED"], "startCourierResponses");
  return transition(decision, {
    toStatus: "RIDER_RESPONSE_PENDING",
    at,
    actor: "SYSTEM",
    reasonCode: "CONSENT_REQUESTED",
    evidenceIds: decision.consentRequirements.map(
      (requirement) => requirement.courierId,
    ),
    update: (next) => {
      next.consentRequirements = next.consentRequirements.map((requirement) => ({
        ...requirement,
        status: requirement.required ? "PENDING" : requirement.status,
      }));
    },
  });
}

export function recordCourierResponse(
  rawDecision: DecisionRecord,
  input: {
    courierId: string;
    actorId: string;
    response: "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED";
    at: string;
  },
) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["RIDER_RESPONSE_PENDING"], "recordCourierResponse");
  if (input.actorId !== input.courierId) {
    throw new DecisionCommandError(
      "COURIER_ACTOR_MISMATCH",
      "Courier may only submit their own response",
    );
  }
  const requirement = decision.consentRequirements.find(
    (item) => item.courierId === input.courierId,
  );
  if (!requirement?.required || requirement.status !== "PENDING") {
    throw new DecisionCommandError(
      "CONSENT_RESPONSE_NOT_PENDING",
      "Courier does not have a pending consent request",
    );
  }
  const nextRequirements = decision.consentRequirements.map((item) =>
    item.courierId === input.courierId
      ? { ...item, status: input.response, respondedAt: input.at }
      : item,
  );
  const allConsented = nextRequirements.every(
    (item) => !item.required || item.status === "CONSENTED",
  );
  const toStatus =
    input.response === "MODIFICATION_REQUESTED"
      ? "MODIFICATION_REQUESTED"
      : input.response === "DECLINED"
        ? "RIDER_DECLINED"
        : allConsented
          ? "RIDER_CONSENTED"
          : "RIDER_RESPONSE_PENDING";
  return transition(decision, {
    toStatus,
    at: input.at,
    actor: "COURIER",
    actorId: input.actorId,
    reasonCode: `COURIER_${input.response}`,
    evidenceIds: decision.selectedCandidateId
      ? [decision.selectedCandidateId]
      : [],
    update: (next) => {
      next.consentRequirements = nextRequirements;
    },
  });
}

export function expireConsents(rawDecision: DecisionRecord, at: string) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(
    decision,
    ["RIDER_RESPONSE_PENDING", "ADMIN_APPROVAL_REQUIRED"],
    "expireConsents",
  );
  const expiredCourierIds = expiredConsentCourierIds(decision, at);
  if (!expiredCourierIds.length) {
    throw new DecisionCommandError(
      "CONSENT_NOT_EXPIRED",
      "No mandatory consent has reached its expiry time",
    );
  }
  return transition(decision, {
    toStatus: "RIDER_CONSENT_EXPIRED",
    at,
    actor: "SYSTEM",
    reasonCode: "CONSENT_EXPIRED",
    evidenceIds: expiredCourierIds,
    update: (next) => {
      next.consentRequirements = next.consentRequirements.map((requirement) =>
        expiredCourierIds.includes(requirement.courierId)
          ? { ...requirement, status: "EXPIRED", respondedAt: at }
          : requirement,
      );
    },
  });
}

export function requestAdminApproval(rawDecision: DecisionRecord, at: string) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["RIDER_CONSENTED"], "requestAdminApproval");
  if (!requiredConsentsAreComplete(decision)) {
    throw new DecisionCommandError(
      "CONSENT_REQUIRED",
      "All mandatory consent must be completed",
    );
  }
  return transition(decision, {
    toStatus: "ADMIN_APPROVAL_REQUIRED",
    at,
    actor: "SYSTEM",
    reasonCode: "ADMIN_APPROVAL_REQUIRED",
    evidenceIds: decision.consentRequirements.map(
      (requirement) => requirement.courierId,
    ),
  });
}

export function recordAdminDecision(
  rawDecision: DecisionRecord,
  input: {
    adminId: string;
    action: "APPROVE" | "HOLD" | "MODIFICATION_REQUESTED" | "CANCEL";
    at: string;
  },
) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["ADMIN_APPROVAL_REQUIRED"], "recordAdminDecision");
  if (input.action === "APPROVE") {
    if (!requiredConsentsAreComplete(decision)) {
      throw new DecisionCommandError(
        "CONSENT_REQUIRED",
        "Administrator cannot approve without all mandatory consent",
      );
    }
    if (expiredConsentCourierIds(decision, input.at).length) {
      throw new DecisionCommandError(
        "CONSENT_EXPIRED",
        "Administrator cannot approve expired consent",
      );
    }
  }
  const toStatus =
    input.action === "APPROVE"
      ? "APPROVED"
      : input.action === "HOLD"
        ? "ADMIN_HELD"
        : input.action === "MODIFICATION_REQUESTED"
          ? "ADMIN_MODIFICATION_REQUESTED"
          : "CANCELLED";
  return transition(decision, {
    toStatus,
    at: input.at,
    actor: "ADMIN",
    actorId: input.adminId,
    reasonCode: `ADMIN_${input.action}`,
    evidenceIds: decision.selectedCandidateId
      ? [decision.selectedCandidateId]
      : [],
    update: (next) => {
      if (input.action === "APPROVE") {
        next.approvedByAdminId = input.adminId;
        next.approvedAt = input.at;
      }
    },
  });
}

export function resumeAdminReview(rawDecision: DecisionRecord, at: string) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["ADMIN_HELD"], "resumeAdminReview");
  return transition(decision, {
    toStatus: "ADMIN_APPROVAL_REQUIRED",
    at,
    actor: "SYSTEM",
    reasonCode: "ADMIN_REVIEW_RESUMED",
  });
}

export function beginRevalidation(rawDecision: DecisionRecord, at: string) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["APPROVED"], "beginRevalidation");
  return transition(decision, {
    toStatus: "REVALIDATING",
    at,
    actor: "SYSTEM",
    reasonCode: "REVALIDATION_STARTED",
    evidenceIds: decision.evaluationIds,
  });
}

export function completeRevalidation(
  rawDecision: DecisionRecord,
  input: {
    evaluation: InterventionEvaluation;
    currentPlanVersion: string;
    importantChanges?: string[];
    at: string;
  },
) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["REVALIDATING"], "completeRevalidation");
  const evaluation = InterventionEvaluationSchema.parse(input.evaluation);
  const expiredCourierIds = expiredConsentCourierIds(decision, input.at);
  const consentContextChanged =
    evaluation.versionContext.safetyModelVersion !==
      decision.versionContext.safetyModelVersion ||
    evaluation.versionContext.safetyConfigVersion !==
      decision.versionContext.safetyConfigVersion ||
    evaluation.versionContext.interventionPolicyVersion !==
      decision.versionContext.interventionPolicyVersion ||
    evaluation.versionContext.planVersion !== decision.versionContext.planVersion;
  const reasons = [
    ...(input.currentPlanVersion !== decision.baselinePlanVersion
      ? ["STALE_PLAN_VERSION"]
      : []),
    ...(evaluation.candidateId !== decision.selectedCandidateId
      ? ["REVALIDATION_CANDIDATE_MISMATCH"]
      : []),
    ...(evaluation.feasibility.status !== "FEASIBLE"
      ? ["REVALIDATION_NOT_FEASIBLE"]
      : []),
    ...((input.importantChanges?.length ?? 0) > 0
      ? ["IMPORTANT_INPUT_CHANGED"]
      : []),
    ...(consentContextChanged ? ["CONSENT_CONTEXT_CHANGED"] : []),
    ...(expiredCourierIds.length ? ["CONSENT_EXPIRED"] : []),
  ];
  if (reasons.length) {
    return transition(decision, {
      toStatus: "REVALIDATION_REQUIRED",
      at: input.at,
      actor: "SYSTEM",
      reasonCode: reasons[0],
      evidenceIds: [evaluation.evaluationId, ...(input.importantChanges ?? [])],
      update: (next) => {
        if (expiredCourierIds.length) {
          next.consentRequirements = next.consentRequirements.map((requirement) =>
            expiredCourierIds.includes(requirement.courierId)
              ? { ...requirement, status: "EXPIRED", respondedAt: input.at }
              : requirement,
          );
        }
      },
    });
  }
  return transition(decision, {
    toStatus: "APPLYING_PLAN",
    at: input.at,
    actor: "SYSTEM",
    reasonCode: "REVALIDATION_PASSED",
    evidenceIds: [evaluation.evaluationId],
    update: (next) => {
      next.evaluationIds = unique([...next.evaluationIds, evaluation.evaluationId]);
      next.versionContext = structuredClone(evaluation.versionContext);
    },
  });
}

export function recordCustomerNotices(
  rawDecision: DecisionRecord,
  noticeIds: string[],
  at: string,
) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["APPLIED"], "recordCustomerNotices");
  const normalized = unique(noticeIds);
  if (!normalized.length) {
    throw new DecisionCommandError(
      "CUSTOMER_NOTICE_REQUIRED",
      "At least one applied-plan customer notice is required",
    );
  }
  return transition(decision, {
    toStatus: "NOTICE_RECORDED",
    at,
    actor: "SYSTEM",
    reasonCode: "CUSTOMER_NOTICES_RECORDED",
    evidenceIds: normalized,
    update: (next) => {
      next.customerNoticeIds = normalized;
    },
  });
}

export function closeDecision(rawDecision: DecisionRecord, at: string) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["NOTICE_RECORDED"], "closeDecision");
  return transition(decision, {
    toStatus: "CLOSED",
    at,
    actor: "SYSTEM",
    reasonCode: "DECISION_CLOSED",
    evidenceIds: decision.customerNoticeIds,
  });
}

export function transitionApplyOutcome(
  rawDecision: DecisionRecord,
  input: {
    status: "APPLIED" | "APPLY_FAILED" | "REVALIDATION_REQUIRED";
    at: string;
    reasonCode: string;
    appliedPlanVersion?: string;
    evidenceIds?: string[];
  },
) {
  const decision = DecisionRecordSchema.parse(rawDecision);
  requireStatus(decision, ["APPLYING_PLAN"], "transitionApplyOutcome");
  return transition(decision, {
    toStatus: input.status,
    at: input.at,
    actor: "SYSTEM",
    reasonCode: input.reasonCode,
    evidenceIds: input.evidenceIds,
    update: (next) => {
      if (input.status === "APPLIED") {
        if (!input.appliedPlanVersion) {
          throw new DecisionCommandError(
            "APPLIED_PLAN_VERSION_REQUIRED",
            "Applied transition requires a plan version",
          );
        }
        next.appliedPlanVersion = input.appliedPlanVersion;
      }
    },
  });
}

export const decisionPolicy = {
  consentValidityMinutes: CONSENT_VALIDITY_MINUTES,
} as const;
