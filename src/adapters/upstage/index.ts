import type {
  ExplanationInput,
  ExplanationOutput,
} from "../../domain/contracts";
import type { ExplanationProvider } from "../../application/explanations";

const defaultMockOutput = (input: ExplanationInput): ExplanationOutput => {
  const facts = [
    ...input.numericFacts.map(
      (fact) => `${fact.label} ${fact.displayValue}`,
    ),
    ...input.stateFacts.map((fact) => `${fact.label} ${fact.value}`),
  ];
  return {
    requestId: input.requestId,
    role: input.role,
    summary: `검증된 사실만 설명합니다.${facts.length ? ` ${facts.join(", ")}.` : ""}`,
    actions:
      input.allowedActions.length === 0
        ? undefined
        : input.role === "COURIER"
          ? input.allowedActions.slice(0, 1)
          : [...input.allowedActions],
    citedFactIds: [
      ...input.numericFacts.map((fact) => fact.factId),
      ...input.stateFacts.map((fact) => fact.factId),
    ],
    citationIds: input.allowedCitations.map(
      (citation) => citation.citationId,
    ),
    uncertaintyStatement:
      "결측과 신뢰도는 입력에 제공된 상태만 사용했습니다.",
    dataModeLabel: input.dataMode === "DEMO" ? "Demo fixture" : "Live pilot",
  };
};

export function createUpstageMockProvider(
  response: (
    input: ExplanationInput,
  ) => unknown | Promise<unknown> = defaultMockOutput,
): ExplanationProvider {
  return {
    provider: "UPSTAGE",
    mode: "MOCK",
    model: "upstage-mock-contract-v1",
    generate: async (input) => response(input),
  };
}

export * from "./demoDocument";
export * from "./proxy";
