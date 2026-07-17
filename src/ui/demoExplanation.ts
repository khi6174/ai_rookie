import {
  createUpstageMockProvider,
  demoRainSlopeCitation,
} from "../adapters/upstage";
import {
  ExplanationProviderError,
  generateExplanation,
} from "../application/explanations";
import {
  ExplanationInputSchema,
  type ExplanationResult,
} from "../domain/contracts";
import {
  demoRecommendedEvaluation,
  demoTransfer12Evaluation,
} from "./demoSession";

const sourceImpact = demoRecommendedEvaluation.courierImpacts.find(
  (impact) => impact.role === "SOURCE",
)!;
const recipientImpact = demoRecommendedEvaluation.courierImpacts.find(
  (impact) => impact.role === "RECIPIENT",
)!;

export const demoAdminExplanationInput = ExplanationInputSchema.parse({
  requestId: "explanation-scenario-a-admin-001",
  role: "ADMIN",
  language: "ko",
  dataMode: "DEMO",
  numericFacts: [
    {
      factId: "time-to-breach",
      label: "조정 전 임계치 초과 예상",
      value: 52,
      unit: "minutes",
      displayValue: "약 52분 후",
    },
    {
      factId: "source-minimum-before",
      label: "원 기사 조정 전 최소 안전여유",
      value: sourceImpact.baselineMinimumBudget,
      unit: "budget_points",
      displayValue: sourceImpact.baselineMinimumBudget.toFixed(1),
    },
    {
      factId: "source-minimum-after",
      label: "원 기사 조정 후 최소 안전여유",
      value: sourceImpact.candidateMinimumBudget,
      unit: "budget_points",
      displayValue: sourceImpact.candidateMinimumBudget.toFixed(1),
    },
    {
      factId: "recipient-minimum-after",
      label: "수신 기사 조정 후 최소 안전여유",
      value: recipientImpact.candidateMinimumBudget,
      unit: "budget_points",
      displayValue: recipientImpact.candidateMinimumBudget.toFixed(1),
    },
    {
      factId: "blocked-transfer-minimum",
      label: "차단된 이관의 수신 기사 최소 안전여유",
      value: demoTransfer12Evaluation.courierImpacts[1].candidateMinimumBudget,
      unit: "budget_points",
      displayValue:
        demoTransfer12Evaluation.courierImpacts[1].candidateMinimumBudget.toFixed(
          1,
        ),
    },
    {
      factId: "maximum-customer-delay",
      label: "고객 최대 지연",
      value: demoRecommendedEvaluation.maxCustomerEtaDeltaMinutes,
      unit: "minutes",
      displayValue: `최대 +${demoRecommendedEvaluation.maxCustomerEtaDeltaMinutes}분`,
    },
  ],
  stateFacts: [
    {
      factId: "decision-status",
      label: "결정 상태",
      value: "계획과 안내 갱신 완료",
    },
    {
      factId: "selected-intervention",
      label: "적용 조치",
      value: "휴식과 물량이관",
    },
  ],
  allowedCitations: [demoRainSlopeCitation],
  allowedActions: ["결정 근거와 기사 동의를 확인"],
  prohibitedTopics: ["기사 평가", "징계", "순위", "사고확률"],
});

export async function generateDemoAdminExplanation(
  simulateFailure = false,
): Promise<ExplanationResult> {
  return generateExplanation({
    input: demoAdminExplanationInput,
    provider: createUpstageMockProvider(
      simulateFailure
        ? () => {
            throw new ExplanationProviderError("TIMEOUT");
          }
        : undefined,
    ),
    receivedAt: "2026-07-14T00:10:00.000Z",
  });
}
