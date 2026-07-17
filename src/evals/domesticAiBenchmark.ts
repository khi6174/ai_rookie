import {
  createTemplateExplanation,
  ExplanationIntegrityError,
  ExplanationProviderError,
  explanationPromptVersion,
  validateExplanationOutput,
  type ExplanationFailureCode,
} from "../application/explanations";
import type { ExplanationInput } from "../domain/contracts";
import { upstageSmokeTasks, type UpstageSmokeTask } from "./upstageSmoke";
import type {
  DomesticAiBenchmarkProvider,
  DomesticAiProviderId,
  DomesticAiUsage,
} from "./domesticAiProvider";

export type DomesticAiBenchmarkTask = UpstageSmokeTask;
export const domesticAiBenchmarkTasks: DomesticAiBenchmarkTask[] =
  upstageSmokeTasks.map((task) => ({
    ...task,
    taskId: task.taskId.replace("upstage-smoke-", "domestic-ai-"),
  }));

export type DomesticAiBenchmarkFailureCode =
  | ExplanationFailureCode
  | "REQUIRED_FACT_OMISSION"
  | "REQUIRED_CITATION_OMISSION"
  | "DISPLAY_VALUE_OMISSION";

export type DomesticAiTaskResult = {
  taskId: string;
  role: ExplanationInput["role"];
  status: "PASSED" | "FALLBACK";
  passed: boolean;
  latencyMs: number;
  usage: DomesticAiUsage;
  fallbackCode?: DomesticAiBenchmarkFailureCode;
};

export type DomesticAiProviderRun = {
  providerId: DomesticAiProviderId;
  providerMode: DomesticAiBenchmarkProvider["mode"];
  protocol: DomesticAiBenchmarkProvider["protocol"];
  model: string;
  promptVersion: string;
  taskCount: number;
  results: DomesticAiTaskResult[];
  metrics: {
    passed: number;
    failed: number;
    fallback: number;
    firstAttemptPassRate: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    unsafeDisplayCount: 0;
    fallbackCodes: Record<string, number>;
  };
};

export type DomesticAiBenchmarkRun = {
  schemaVersion: "domestic-ai-api-benchmark-v1";
  capturedAt: string;
  taskCountPerProvider: number;
  providerCount: number;
  providers: DomesticAiProviderRun[];
};

const percentile95 = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
};

const sumUsage = (results: DomesticAiTaskResult[], key: keyof DomesticAiUsage) => {
  const values = results
    .map((result) => result.usage[key])
    .filter((value): value is number => value !== undefined);
  return values.length === 0
    ? undefined
    : values.reduce((total, value) => total + value, 0);
};

function benchmarkFailureCode(error: unknown): DomesticAiBenchmarkFailureCode {
  return error instanceof ExplanationProviderError ||
    error instanceof ExplanationIntegrityError
    ? error.code
    : "UNKNOWN";
}

async function runProvider({
  provider,
  tasks,
  nowMs,
}: {
  provider: DomesticAiBenchmarkProvider;
  tasks: DomesticAiBenchmarkTask[];
  nowMs: () => number;
}): Promise<DomesticAiProviderRun> {
  const results: DomesticAiTaskResult[] = [];
  for (const task of tasks) {
    const startedAt = nowMs();
    let usage: DomesticAiUsage = {};
    try {
      const generation = await provider.generate(task.input);
      usage = generation.usage;
      const output = validateExplanationOutput(task.input, generation.output);
      const factIds = new Set(output.citedFactIds);
      const citationIds = new Set(output.citationIds);
      const text = [
        output.summary,
        ...(output.actions ?? []),
        output.uncertaintyStatement ?? "",
      ].join(" ");
      let fallbackCode: DomesticAiBenchmarkFailureCode | undefined;
      if (!task.requiredFactIds.every((factId) => factIds.has(factId))) {
        fallbackCode = "REQUIRED_FACT_OMISSION";
      } else if (
        !task.requiredCitationIds.every((citationId) =>
          citationIds.has(citationId),
        )
      ) {
        fallbackCode = "REQUIRED_CITATION_OMISSION";
      } else if (
        !task.requiredDisplayValues.every((displayValue) =>
          text.includes(displayValue),
        )
      ) {
        fallbackCode = "DISPLAY_VALUE_OMISSION";
      }
      results.push({
        taskId: task.taskId,
        role: task.input.role,
        status: fallbackCode ? "FALLBACK" : "PASSED",
        passed: !fallbackCode,
        latencyMs: Math.max(0, nowMs() - startedAt),
        usage,
        fallbackCode,
      });
    } catch (error) {
      results.push({
        taskId: task.taskId,
        role: task.input.role,
        status: "FALLBACK",
        passed: false,
        latencyMs: Math.max(0, nowMs() - startedAt),
        usage,
        fallbackCode: benchmarkFailureCode(error),
      });
    }
  }
  const latencies = results.map((result) => result.latencyMs);
  const fallbackCodes = results.reduce<Record<string, number>>(
    (counts, result) => {
      if (result.fallbackCode) {
        counts[result.fallbackCode] = (counts[result.fallbackCode] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );
  const passed = results.filter((result) => result.passed).length;
  return {
    providerId: provider.providerId,
    providerMode: provider.mode,
    protocol: provider.protocol,
    model: provider.model,
    promptVersion: explanationPromptVersion,
    taskCount: tasks.length,
    results,
    metrics: {
      passed,
      failed: results.length - passed,
      fallback: results.filter((result) => result.status === "FALLBACK").length,
      firstAttemptPassRate: results.length === 0 ? 0 : passed / results.length,
      averageLatencyMs:
        latencies.length === 0
          ? 0
          : Math.round(
              latencies.reduce((total, latency) => total + latency, 0) /
                latencies.length,
            ),
      p95LatencyMs: percentile95(latencies),
      promptTokens: sumUsage(results, "promptTokens"),
      completionTokens: sumUsage(results, "completionTokens"),
      totalTokens: sumUsage(results, "totalTokens"),
      unsafeDisplayCount: 0,
      fallbackCodes,
    },
  };
}

export async function runDomesticAiBenchmark({
  providers,
  tasks = domesticAiBenchmarkTasks,
  nowMs = Date.now,
  nowIso = () => new Date().toISOString(),
}: {
  providers: DomesticAiBenchmarkProvider[];
  tasks?: DomesticAiBenchmarkTask[];
  nowMs?: () => number;
  nowIso?: () => string;
}): Promise<DomesticAiBenchmarkRun> {
  const providerRuns: DomesticAiProviderRun[] = [];
  for (const provider of providers) {
    providerRuns.push(await runProvider({ provider, tasks, nowMs }));
  }
  return {
    schemaVersion: "domestic-ai-api-benchmark-v1",
    capturedAt: nowIso(),
    taskCountPerProvider: tasks.length,
    providerCount: providers.length,
    providers: providerRuns,
  };
}

export function createDomesticAiMockProvider(
  providerId: DomesticAiProviderId,
): DomesticAiBenchmarkProvider {
  return {
    providerId,
    mode: "MOCK",
    model: `${providerId.toLowerCase()}-mock-contract-v1`,
    protocol: "MOCK",
    generate: async (input) => ({
      output: createTemplateExplanation(input),
      usage: {},
    }),
  };
}
