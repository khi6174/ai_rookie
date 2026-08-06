import { createUpstageProxyProvider } from "../adapters/upstage";
import { generateExplanation } from "../application/explanations";
import {
  ExplanationInputSchema,
  type ExplanationResult,
} from "../domain/contracts";

type OperationsExplanationFacts = {
  requestId: string;
  currentBudget: number;
  currentBudgetLabel: string;
  candidateMinimumBudget: number;
  etaDeltaMinutes: number;
  etaDisplayValue: string;
  decisionStatus: string;
  selectedIntervention: string;
  confidence: string;
  confidenceLabel: string;
  allowedActions: string[];
  timeToBreachMinutes?: number;
  breachStopOrdinal?: number;
};

export async function generateOperationsAdminExplanation(
  facts: OperationsExplanationFacts,
): Promise<ExplanationResult> {
  const input = ExplanationInputSchema.parse({
    requestId: facts.requestId,
    role: "ADMIN",
    language: "ko",
    dataMode: "DEMO",
    numericFacts: [
      ...(facts.timeToBreachMinutes === undefined
        ? []
        : [{
            factId: "time-to-breach",
            label: "안전한계 예상",
            value: facts.timeToBreachMinutes,
            unit: "minutes",
            displayValue: `${facts.timeToBreachMinutes}분 뒤`,
          }]),
      ...(facts.breachStopOrdinal === undefined
        ? []
        : [{
            factId: "breach-stop",
            label: "예상 배송지",
            value: facts.breachStopOrdinal,
            unit: "stop_ordinal",
            displayValue: `${facts.breachStopOrdinal}번째 배송지 전`,
          }]),
      {
        factId: "current-budget",
        label: facts.currentBudgetLabel,
        value: facts.currentBudget,
        unit: "budget_points",
        displayValue: facts.currentBudget.toFixed(1),
      },
      {
        factId: "candidate-minimum-budget",
        label: "조정 후 최저 안전여유",
        value: facts.candidateMinimumBudget,
        unit: "budget_points",
        displayValue: facts.candidateMinimumBudget.toFixed(1),
      },
      {
        factId: "eta-delta",
        label: "배송 시간 변화",
        value: facts.etaDeltaMinutes,
        unit: "minutes",
        displayValue: facts.etaDisplayValue,
      },
    ],
    stateFacts: [
      {
        factId: "decision-status",
        label: "결정 상태",
        value: facts.decisionStatus,
      },
      {
        factId: "selected-intervention",
        label: "선택 지원",
        value: facts.selectedIntervention,
      },
      {
        factId: "confidence",
        label: facts.confidenceLabel,
        value: facts.confidence,
      },
    ],
    allowedCitations: [],
    allowedActions: facts.allowedActions,
    prohibitedTopics: ["기사 평가", "징계", "순위", "사고확률"],
  });

  return generateExplanation({
    input,
    provider: createUpstageProxyProvider(),
    receivedAt: new Date().toISOString(),
  });
}
