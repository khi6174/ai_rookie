import { createTemplateExplanation } from "../application/explanations";
import {
  runDomesticAiExplanationCascade,
  type DomesticAiCascadeAttempt,
  type DomesticAiCascadeProvider,
  type DomesticAiCascadeResult,
} from "../application/explanations/cascade";
import type { ExplanationInput } from "../domain/contracts";
import { domesticAiBenchmarkTasks } from "./domesticAiBenchmark";

export const domesticAiCascadeStrategies = [
  "LOCAL_ONLY",
  "HOSTED_ONLY",
  "CASCADE",
] as const;

export type DomesticAiCascadeStrategy =
  (typeof domesticAiCascadeStrategies)[number];

export type DomesticAiCascadeBenchmarkTaskResult = {
  taskId: string;
  strategy: DomesticAiCascadeStrategy;
  finalStatus: DomesticAiCascadeResult["status"];
  selectedProviderId: DomesticAiCascadeResult["providerId"];
  requiredCapability: DomesticAiCascadeResult["requiredCapability"];
  escalated: boolean;
  attemptCount: number;
  attempts: DomesticAiCascadeAttempt[];
};

export type DomesticAiCascadeStrategyMetrics = {
  strategy: DomesticAiCascadeStrategy;
  taskCount: number;
  verifiedLocal: number;
  verifiedHosted: number;
  fallback: number;
  escalated: number;
  finalVerifiedRate: number;
  unsafeDisplayCount: 0;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  failureCodes: Record<string, number>;
};

export type DomesticAiCascadeBenchmarkRun = {
  schemaVersion: "domestic-ai-cascade-benchmark-v1";
  dataMode: "MOCK";
  capturedAt: string;
  promptVersion: "explanation-ko-v1.1.0";
  taskCountPerStrategy: number;
  strategies: DomesticAiCascadeStrategy[];
  results: DomesticAiCascadeBenchmarkTaskResult[];
  metrics: DomesticAiCascadeStrategyMetrics[];
};

const localRejectedTaskIds = new Set([
  "domestic-ai-injection-citation-009",
  "domestic-ai-decimal-integrity-011",
  "domestic-ai-fallback-boundary-012",
]);

const provider = ({
  providerId,
  tier,
  model,
  output,
}: {
  providerId: DomesticAiCascadeProvider["providerId"];
  tier: DomesticAiCascadeProvider["tier"];
  model: string;
  output: (input: ExplanationInput) => unknown;
}): DomesticAiCascadeProvider => ({
  providerId,
  tier,
  mode: "MOCK",
  model,
  capabilities: [
    "ROLE_EXPLANATION",
    "CITATION_GROUNDED_EXPLANATION",
    "LONG_CONTEXT_EXPLANATION",
  ],
  generate: async (input) => ({
    output: output(input),
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  }),
});

const localProviderForTask = (
  taskId: string,
): DomesticAiCascadeProvider =>
  provider({
    providerId: "AX_LOCAL",
    tier: "LOCAL",
    model: "ax-local-candidate-mock-v1",
    output: (input) =>
      localRejectedTaskIds.has(taskId)
        ? { requestId: input.requestId, summary: "rejected mock output" }
        : createTemplateExplanation(input),
  });

const hostedProvider = provider({
  providerId: "AX",
  tier: "HOSTED",
  model: "A.X-K1-mock-contract-v1",
  output: createTemplateExplanation,
});

const sumOptionalUsage = (
  attempts: DomesticAiCascadeAttempt[],
  key: "promptTokens" | "completionTokens" | "totalTokens",
) => {
  const values = attempts
    .map((attempt) => attempt.usage?.[key])
    .filter((value): value is number => value !== undefined);
  return values.length === 0
    ? undefined
    : values.reduce((total, value) => total + value, 0);
};

const summarizeStrategy = (
  strategy: DomesticAiCascadeStrategy,
  results: DomesticAiCascadeBenchmarkTaskResult[],
): DomesticAiCascadeStrategyMetrics => {
  const selected = results.filter((result) => result.strategy === strategy);
  const failureCodes: Record<string, number> = {};
  for (const attempt of selected.flatMap((result) => result.attempts)) {
    if (attempt.failureCode) {
      failureCodes[attempt.failureCode] =
        (failureCodes[attempt.failureCode] ?? 0) + 1;
    }
  }
  const allAttempts = selected.flatMap((result) => result.attempts);
  const verifiedLocal = selected.filter(
    (result) => result.finalStatus === "VERIFIED_LOCAL",
  ).length;
  const verifiedHosted = selected.filter(
    (result) => result.finalStatus === "VERIFIED_HOSTED",
  ).length;
  const fallback = selected.filter(
    (result) => result.finalStatus === "FALLBACK",
  ).length;
  return {
    strategy,
    taskCount: selected.length,
    verifiedLocal,
    verifiedHosted,
    fallback,
    escalated: selected.filter((result) => result.escalated).length,
    finalVerifiedRate:
      selected.length === 0
        ? 0
        : (verifiedLocal + verifiedHosted) / selected.length,
    unsafeDisplayCount: 0,
    promptTokens: sumOptionalUsage(allAttempts, "promptTokens"),
    completionTokens: sumOptionalUsage(allAttempts, "completionTokens"),
    totalTokens: sumOptionalUsage(allAttempts, "totalTokens"),
    failureCodes,
  };
};

export async function runDomesticAiCascadeMockBenchmark({
  capturedAt = new Date().toISOString(),
}: {
  capturedAt?: string;
} = {}): Promise<DomesticAiCascadeBenchmarkRun> {
  const results: DomesticAiCascadeBenchmarkTaskResult[] = [];
  for (const task of domesticAiBenchmarkTasks) {
    for (const strategy of domesticAiCascadeStrategies) {
      const cascade = await runDomesticAiExplanationCascade({
        input: task.input,
        localProvider:
          strategy === "HOSTED_ONLY"
            ? undefined
            : localProviderForTask(task.taskId),
        hostedProviders: strategy === "LOCAL_ONLY" ? [] : [hostedProvider],
        receivedAt: capturedAt,
        now: () => new Date(capturedAt),
        monotonicNow: () => 0,
      });
      results.push({
        taskId: task.taskId,
        strategy,
        finalStatus: cascade.status,
        selectedProviderId: cascade.providerId,
        requiredCapability: cascade.requiredCapability,
        escalated:
          strategy === "CASCADE" && cascade.status === "VERIFIED_HOSTED",
        attemptCount: cascade.attempts.length,
        attempts: cascade.attempts,
      });
    }
  }
  return {
    schemaVersion: "domestic-ai-cascade-benchmark-v1",
    dataMode: "MOCK",
    capturedAt,
    promptVersion: "explanation-ko-v1.1.0",
    taskCountPerStrategy: domesticAiBenchmarkTasks.length,
    strategies: [...domesticAiCascadeStrategies],
    results,
    metrics: domesticAiCascadeStrategies.map((strategy) =>
      summarizeStrategy(strategy, results),
    ),
  };
}
