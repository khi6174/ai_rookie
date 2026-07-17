import {
  ExplanationInputSchema,
  ExplanationOutputSchema,
  ExplanationResultSchema,
  type ExplanationInput,
  type ExplanationOutput,
  type ExplanationResult,
} from "../../domain/contracts";

export const explanationPromptVersion = "explanation-ko-v1.1.0";

export type ExplanationFailureCode =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "MALFORMED_RESPONSE"
  | "SCHEMA_VALIDATION_FAILED"
  | "UNSUPPORTED_NUMERIC_CLAIM"
  | "INVALID_CITATION"
  | "PROHIBITED_CONTENT"
  | "ROLE_MISMATCH"
  | "DATA_MODE_MISMATCH"
  | "UNKNOWN";

export type ExplanationProvider = {
  provider: "UPSTAGE";
  mode: "LIVE" | "MOCK";
  model: string;
  generate(input: ExplanationInput): Promise<unknown>;
};

export class ExplanationProviderError extends Error {
  constructor(
    readonly code: ExplanationFailureCode,
    message = "Explanation provider failed",
  ) {
    super(message);
    this.name = "ExplanationProviderError";
  }
}

export class ExplanationIntegrityError extends Error {
  constructor(
    readonly code: ExplanationFailureCode,
    message = "Explanation output failed validation",
  ) {
    super(message);
    this.name = "ExplanationIntegrityError";
  }
}

const builtInProhibitedPhrases = [
  "위험한 기사",
  "저성과 기사",
  "거절이 많은 기사",
  "AI 명령 불이행",
  "사고확률",
  "최하위 기사",
  "AI가 결정",
];

const customerProhibitedPhrases = ["기사", "동의", "거절", "건강", "피로"];

const finalText = (output: ExplanationOutput) =>
  [
    output.summary,
    ...(output.actions ?? []),
    output.uncertaintyStatement ?? "",
  ].join(" ");

const expectedModeLabel = (input: ExplanationInput) =>
  input.dataMode === "DEMO" ? "Demo fixture" : "Live pilot";

export function validateExplanationOutput(
  rawInput: ExplanationInput,
  rawOutput: unknown,
): ExplanationOutput {
  const input = ExplanationInputSchema.parse(rawInput);
  const parsed = ExplanationOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    throw new ExplanationIntegrityError("SCHEMA_VALIDATION_FAILED");
  }
  const output = parsed.data;
  if (output.requestId !== input.requestId || output.role !== input.role) {
    throw new ExplanationIntegrityError("ROLE_MISMATCH");
  }
  if (output.dataModeLabel !== expectedModeLabel(input)) {
    throw new ExplanationIntegrityError("DATA_MODE_MISMATCH");
  }

  const allowedFactIds = new Set(
    [...input.numericFacts, ...input.stateFacts].map((fact) => fact.factId),
  );
  if (output.citedFactIds.some((factId) => !allowedFactIds.has(factId))) {
    throw new ExplanationIntegrityError("INVALID_CITATION");
  }
  const allowedCitationIds = new Set(
    input.allowedCitations.map((citation) => citation.citationId),
  );
  if (
    output.citationIds.some(
      (citationId) => !allowedCitationIds.has(citationId),
    )
  ) {
    throw new ExplanationIntegrityError("INVALID_CITATION");
  }

  const text = finalText(output);
  for (const fact of input.numericFacts) {
    if (
      text.includes(fact.displayValue) &&
      !output.citedFactIds.includes(fact.factId)
    ) {
      throw new ExplanationIntegrityError("INVALID_CITATION");
    }
  }
  let textWithoutApprovedNumbers = text;
  for (const fact of input.numericFacts) {
    textWithoutApprovedNumbers = textWithoutApprovedNumbers
      .split(fact.displayValue)
      .join(" ");
  }
  if (/[-+]?\d+(?:[.,]\d+)?/.test(textWithoutApprovedNumbers)) {
    throw new ExplanationIntegrityError("UNSUPPORTED_NUMERIC_CLAIM");
  }

  const allowedActions = new Set(input.allowedActions);
  if ((output.actions ?? []).some((action) => !allowedActions.has(action))) {
    throw new ExplanationIntegrityError("PROHIBITED_CONTENT");
  }
  if (input.role === "COURIER" && (output.actions?.length ?? 0) > 1) {
    throw new ExplanationIntegrityError("PROHIBITED_CONTENT");
  }

  const normalizedText = text.toLocaleLowerCase("ko-KR");
  const prohibited = [
    ...builtInProhibitedPhrases,
    ...input.prohibitedTopics,
    ...(input.role === "CUSTOMER" ? customerProhibitedPhrases : []),
  ];
  if (
    prohibited.some((phrase) =>
      normalizedText.includes(phrase.toLocaleLowerCase("ko-KR")),
    )
  ) {
    throw new ExplanationIntegrityError("PROHIBITED_CONTENT");
  }
  return output;
}

export function createTemplateExplanation(
  rawInput: ExplanationInput,
): ExplanationOutput {
  const input = ExplanationInputSchema.parse(rawInput);
  const prefixes: Record<ExplanationInput["role"], string> = {
    COURIER: "정차 상태에서 조정안을 확인해 주세요.",
    ADMIN: "검증된 결정 사실과 안전 제약을 요약합니다.",
    CUSTOMER: "안전한 배송운영을 위한 조정 안내입니다.",
    REPORT: "시뮬레이션 안전개입 결과 요약입니다.",
  };
  const details = [
    ...input.numericFacts.map(
      (fact) => `${fact.label} ${fact.displayValue}`,
    ),
    ...input.stateFacts.map((fact) => `${fact.label} ${fact.value}`),
  ];
  const output: ExplanationOutput = {
    requestId: input.requestId,
    role: input.role,
    summary: `${prefixes[input.role]}${details.length ? ` ${details.join(", ")}.` : ""}`,
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
      "입력 신뢰도와 결측 상태는 제공된 결정 사실을 따릅니다.",
    dataModeLabel: expectedModeLabel(input),
  };
  return validateExplanationOutput(input, output);
}

const validation = {
  outputSchemaValid: true,
  numericFactsValid: true,
  citationsValid: true,
  rolePolicyValid: true,
} as const;

type ExplanationFallbackResult = Extract<
  ExplanationResult,
  { status: "FALLBACK" }
>;

const providerFailure = (
  error: unknown,
  occurredAt: string,
): ExplanationFallbackResult["fallbackReason"] => {
  const code =
    error instanceof ExplanationProviderError ||
    error instanceof ExplanationIntegrityError
      ? error.code
      : "UNKNOWN";
  return {
    code,
    message: "Explanation service could not return a verified response",
    retryable: [
      "NETWORK_ERROR",
      "TIMEOUT",
      "RATE_LIMITED",
      "UNKNOWN",
    ].includes(code),
    occurredAt,
    sourceId: "upstage-explanation",
  };
};

export async function generateExplanation({
  input: rawInput,
  provider,
  receivedAt,
}: {
  input: ExplanationInput;
  provider: ExplanationProvider;
  receivedAt: string;
}): Promise<ExplanationResult> {
  const input = ExplanationInputSchema.parse(rawInput);
  try {
    const rawOutput = await provider.generate(input);
    const data = validateExplanationOutput(input, rawOutput);
    return ExplanationResultSchema.parse({
      status: provider.mode,
      data,
      provider: provider.mode === "LIVE" ? "UPSTAGE" : "UPSTAGE_MOCK",
      model: provider.model,
      promptVersion: explanationPromptVersion,
      receivedAt,
      validation,
    });
  } catch (error) {
    const data = createTemplateExplanation(input);
    return ExplanationResultSchema.parse({
      status: "FALLBACK",
      data,
      provider: "TEMPLATE",
      attemptedProvider: "UPSTAGE",
      model: provider.model,
      promptVersion: explanationPromptVersion,
      receivedAt,
      validation,
      fallbackReason: providerFailure(error, receivedAt),
    });
  }
}
