import { rainyHillyLongShiftFixture } from "../adapters/fixtures";
import { resolveWeatherRuntimeFallback } from "../adapters/weather";
import {
  applyPlanAtomically,
  createDemoPlanStore,
  recordPendingCustomerNotices,
  type DemoPlanStore,
} from "../application/apply-plan";
import type {
  DecisionRecord,
  InterventionCandidate,
  InterventionEvaluation,
} from "../domain/contracts";
import {
  beginRevalidation,
  completeRevalidation,
  createDecisionRecord,
  recordAdminDecision,
  recordCourierResponse,
  recordEvaluatedCandidates,
  recordGeneratedCandidates,
  requestAdminApproval,
  requestCourierReview,
  startCourierResponses,
} from "../domain/decisions";
import {
  createRestCandidate,
  createRestTransferCandidate,
  createTransferCandidate,
  evaluateIntervention,
  materializeInterventionPlan,
  rankInterventions,
} from "../domain/interventions";
import { evaluateSafetyBudget } from "../domain/safety";

export const demoFixture = rainyHillyLongShiftFixture;
export const demoWeatherRuntime = resolveWeatherRuntimeFallback({
  safeForSafetyEngine: false,
  fallbackTimeline: demoFixture.weatherTimeline,
  fallbackFixtureId: demoFixture.fixtureId,
  liveEvidence: {
    status: "PARTIAL",
    capturedAt: "2026-07-17T13:06:28.598Z",
    sourceIds: [
      "kma-api-hub-ultra-short-observation",
      "kma-api-hub-ultra-short-forecast",
      "kma-api-hub-high-resolution-point",
      "kma-api-hub-vilage-short-forecast-weather",
    ],
    responseHashes: [
      "48ec728ea332dbb73c8006e29a2e1036622a0e63c682d90a5789c58bfdcceee2",
      "9eba57015d22ca6aea84daf674a3a9b242e81026290e485a730acdc490b2fad8",
      "9a72ad20d9b2fdcd2b11cfd48e1eeaadb633e32f148e102d58872cc865af9ef0",
      "0704cc984d963681daa0a38d8be091b196cca0b267429b1f2855453ffe3d2a31",
    ],
    readyFields: [
      { timeScope: "CURRENT", field: "rainfallMmPerHour" },
      { timeScope: "CURRENT", field: "feelsLikeCelsius" },
      { timeScope: "CURRENT", field: "visibilityMeters" },
      { timeScope: "CURRENT", field: "windSpeedMetersPerSecond" },
      { timeScope: "FORECAST_120_MINUTES", field: "rainfallMmPerHour" },
      { timeScope: "FORECAST_120_MINUTES", field: "snowfallCmPerHour" },
      { timeScope: "FORECAST_120_MINUTES", field: "feelsLikeCelsius" },
      { timeScope: "FORECAST_120_MINUTES", field: "windSpeedMetersPerSecond" },
    ],
    blockingFields: [
      {
        timeScope: "CURRENT",
        field: "snowfallCmPerHour",
        reason: "THREE_HOUR_SNOW_CANNOT_BE_DIVIDED_INTO_HOURLY_VALUES",
      },
      {
        timeScope: "FORECAST_120_MINUTES",
        field: "visibilityMeters",
        reason: "NO_APPROVED_FORECAST_SOURCE_OR_POLICY",
      },
    ],
    rawResponsesStored: false,
    credentialsStored: false,
  },
});
export const demoDecisionId = "decision-scenario-a-ui-v1";
export const demoSourceCourierId = demoFixture.couriers[0].courierId;
export const demoRecipientCourierId = demoFixture.couriers[1].courierId;
export const demoBaselineSnapshot = evaluateSafetyBudget(
  demoFixture,
  demoSourceCourierId,
);

const transferStops = (count: number) =>
  demoFixture.stops.slice(-count).map((stop) => stop.stopId);

function createDemoDecisionArtifacts(decisionId: string) {
  const restCandidate = createRestCandidate(
    demoFixture,
    decisionId,
    demoSourceCourierId,
    10,
  );
  const transfer8Candidate = createTransferCandidate(demoFixture, decisionId, {
    sourceCourierId: demoSourceCourierId,
    recipientCourierId: demoRecipientCourierId,
    stopIds: transferStops(8),
  });
  const transfer12Candidate = createTransferCandidate(demoFixture, decisionId, {
    sourceCourierId: demoSourceCourierId,
    recipientCourierId: demoRecipientCourierId,
    stopIds: transferStops(12),
  });
  const recommendedCandidate = createRestTransferCandidate(
    demoFixture,
    decisionId,
    10,
    {
      sourceCourierId: demoSourceCourierId,
      recipientCourierId: demoRecipientCourierId,
      stopIds: transferStops(8),
    },
  );
  const candidates: InterventionCandidate[] = [
    recommendedCandidate,
    transfer8Candidate,
    transfer12Candidate,
    restCandidate,
  ];
  const evaluations: InterventionEvaluation[] = rankInterventions(
    candidates.map((candidate) => evaluateIntervention(demoFixture, candidate)),
  );
  const recommendedEvaluation = evaluations.find(
    (evaluation) => evaluation.candidateId === recommendedCandidate.candidateId,
  );
  const transfer12Evaluation = evaluations.find(
    (evaluation) => evaluation.candidateId === transfer12Candidate.candidateId,
  );
  if (!recommendedEvaluation || !transfer12Evaluation) {
    throw new Error("The UI Demo evaluations must include the required candidates");
  }
  const materializedRecommended = materializeInterventionPlan(
    demoFixture,
    recommendedCandidate,
  );
  if (materializedRecommended.status !== "MATERIALIZED") {
    throw new Error("The UI Demo recommendation must be materializable");
  }
  return {
    candidates,
    evaluations,
    recommendedCandidate,
    recommendedEvaluation,
    transfer12Evaluation,
    proposedPlan: materializedRecommended.plan,
  };
}

const defaultDemoArtifacts = createDemoDecisionArtifacts(demoDecisionId);
export const demoCandidates = defaultDemoArtifacts.candidates;
export const demoEvaluations = defaultDemoArtifacts.evaluations;
export const demoRecommendedCandidate = defaultDemoArtifacts.recommendedCandidate;
export const demoRecommendedEvaluation = defaultDemoArtifacts.recommendedEvaluation;
export const demoTransfer12Evaluation = defaultDemoArtifacts.transfer12Evaluation;
export const demoProposedPlan = defaultDemoArtifacts.proposedPlan;

export function createResetDemoDecisionId() {
  return `decision-scenario-a-ui-reset-${globalThis.crypto.randomUUID()}`;
}

const at = (minutes: number) =>
  new Date(Date.parse(demoFixture.evaluatedAt) + minutes * 60_000).toISOString();

export type DemoSession = {
  decision: DecisionRecord;
  store: DemoPlanStore;
  clockMinute: number;
  announcement: string;
};

export function createInitialDemoSession(
  decisionId: string = demoDecisionId,
): DemoSession {
  const artifacts = createDemoDecisionArtifacts(decisionId);
  const baseline = createDecisionRecord({
    decisionId,
    at: at(0),
    dataMode: "MOCK",
    baselinePlanId: demoFixture.workloads[0].planId,
    baselinePlanVersion: demoFixture.workloads[0].planVersion,
    baselineSnapshotIds: [artifacts.recommendedEvaluation.baselineSnapshotId],
    versionContext: {
      ...artifacts.recommendedEvaluation.versionContext,
      planVersion: demoFixture.workloads[0].planVersion,
    },
  });
  const generated = recordGeneratedCandidates(baseline, artifacts.candidates, at(1));
  const evaluated = recordEvaluatedCandidates(
    generated,
    artifacts.evaluations,
    artifacts.recommendedCandidate.candidateId,
    at(2),
  );
  const review = requestCourierReview(evaluated, at(3));
  const pending = startCourierResponses(review, at(4));
  return {
    decision: pending,
    store: createDemoPlanStore(demoFixture),
    clockMinute: 4,
    announcement: "기사 2명의 검토를 기다리고 있습니다.",
  };
}

export function respondToDemo(
  session: DemoSession,
  courierId: string,
  response: "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED",
): DemoSession {
  const responseAt = session.clockMinute + 1;
  let decision = recordCourierResponse(session.decision, {
    courierId,
    actorId: courierId,
    response,
    at: at(responseAt),
  });
  let announcement =
    response === "CONSENTED"
      ? "동의가 기록되었습니다. 계획은 아직 변경되지 않았습니다."
      : response === "MODIFICATION_REQUESTED"
        ? "수정 요청이 기록되었습니다. 새 대안을 계산해야 합니다."
        : "거절이 기록되었습니다. 불이익 없이 다른 대안을 검토합니다.";
  let clockMinute = responseAt;
  if (decision.status === "RIDER_CONSENTED") {
    clockMinute += 0.1;
    decision = requestAdminApproval(decision, at(clockMinute));
    announcement = "모든 필수 동의가 완료되어 관리자 승인을 기다립니다.";
  }
  return { ...session, decision, clockMinute, announcement };
}

export function holdDemoDecision(session: DemoSession): DemoSession {
  const clockMinute = session.clockMinute + 0.5;
  return {
    ...session,
    decision: recordAdminDecision(session.decision, {
      adminId: "admin-demo-001",
      action: "HOLD",
      at: at(clockMinute),
    }),
    clockMinute,
    announcement: "관리자가 결정을 보류했습니다. 현재 계획은 유지됩니다.",
  };
}

export function requestDemoModification(session: DemoSession): DemoSession {
  const clockMinute = session.clockMinute + 0.5;
  return {
    ...session,
    decision: recordAdminDecision(session.decision, {
      adminId: "admin-demo-001",
      action: "MODIFICATION_REQUESTED",
      at: at(clockMinute),
    }),
    clockMinute,
    announcement: "관리자 수정 요청이 기록되었습니다. 기존 동의는 재사용하지 않습니다.",
  };
}

export function approveAndApplyDemo(session: DemoSession): DemoSession {
  const artifacts = createDemoDecisionArtifacts(session.decision.decisionId);
  let clockMinute = session.clockMinute + 0.2;
  const approved = recordAdminDecision(session.decision, {
    adminId: "admin-demo-001",
    action: "APPROVE",
    at: at(clockMinute),
  });
  clockMinute += 0.1;
  const revalidating = beginRevalidation(approved, at(clockMinute));
  clockMinute += 0.1;
  const applying = completeRevalidation(revalidating, {
    evaluation: artifacts.recommendedEvaluation,
    currentPlanVersion: session.store.activePlan.workloads[0].planVersion,
    at: at(clockMinute),
  });
  clockMinute += 0.1;
  const applied = applyPlanAtomically({
    decision: applying,
    store: session.store,
    proposedPlan: artifacts.proposedPlan,
    customerNoticeRequestIds: ["notice-scenario-a-001"],
    at: at(clockMinute),
  });
  if (applied.status !== "APPLIED" && applied.status !== "ALREADY_APPLIED") {
    return {
      ...session,
      decision: applied.decision,
      store: applied.store,
      clockMinute,
      announcement: "계획을 적용하지 못해 기존 계획을 유지합니다.",
    };
  }
  clockMinute += 0.1;
  const noticed = recordPendingCustomerNotices(
    applied.decision,
    applied.store,
    at(clockMinute),
  );
  return {
    decision: noticed.decision,
    store: noticed.store,
    clockMinute,
    announcement: "승인된 계획과 ETA가 함께 적용되고 고객안내 미리보기가 기록되었습니다.",
  };
}

export const decisionStatusLabels: Record<DecisionRecord["status"], string> = {
  BASELINE_EVALUATED: "기준 계획 평가 완료",
  CANDIDATES_GENERATED: "대안 생성 완료",
  CANDIDATES_EVALUATED: "대안 비교 완료",
  RIDER_REVIEW_REQUIRED: "기사 검토 필요",
  RIDER_RESPONSE_PENDING: "기사 응답 대기",
  RIDER_CONSENTED: "기사 동의 완료",
  MODIFICATION_REQUESTED: "기사 수정 요청",
  RIDER_DECLINED: "다른 대안 필요",
  RIDER_CONSENT_EXPIRED: "재검토 필요",
  ADMIN_APPROVAL_REQUIRED: "관리자 승인 대기",
  ADMIN_HELD: "관리자 보류",
  ADMIN_MODIFICATION_REQUESTED: "관리자 수정 요청",
  APPROVED: "관리자 승인 완료",
  REVALIDATING: "최신 계획 재검증 중",
  REVALIDATION_REQUIRED: "재검증 필요",
  APPLYING_PLAN: "계획 적용 중",
  APPLIED: "계획 적용 완료",
  APPLY_FAILED: "기존 계획 유지",
  NOTICE_RECORDED: "계획·안내 갱신 완료",
  CANCELLED: "결정 취소",
  CLOSED: "결정 종료",
};

export function consentStatusFor(session: DemoSession, courierId: string) {
  return session.decision.consentRequirements.find(
    (requirement) => requirement.courierId === courierId,
  )?.status;
}
