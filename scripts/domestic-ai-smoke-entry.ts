import {
  createDomesticAiMockProvider,
  domesticAiBenchmarkTasks,
  runDomesticAiBenchmark,
} from "../src/evals/domesticAiBenchmark";
import {
  createDomesticAiLiveProvider,
  domesticAiProviderIds,
  missingDomesticAiEnvironmentVariables,
  readDomesticAiLiveConfig,
  type DomesticAiProviderId,
} from "../src/evals/domesticAiProvider";

export { domesticAiProviderIds };

function selectedDomesticAiTasks(taskLimit?: number) {
  if (taskLimit === undefined) return domesticAiBenchmarkTasks;
  if (
    !Number.isInteger(taskLimit) ||
    taskLimit < 1 ||
    taskLimit > domesticAiBenchmarkTasks.length
  ) {
    throw new Error(
      `Domestic AI task limit must be between 1 and ${domesticAiBenchmarkTasks.length}`,
    );
  }
  return domesticAiBenchmarkTasks.slice(0, taskLimit);
}

export function checkDomesticAiLiveConfiguration(
  environment: Record<string, string | undefined>,
  providerIds: DomesticAiProviderId[],
) {
  const missing = missingDomesticAiEnvironmentVariables(
    environment,
    providerIds,
  );
  if (missing.length > 0) {
    return {
      status: "NOT_CONFIGURED" as const,
      providerIds,
      missing,
      message:
        "Domestic AI Live configuration is incomplete. No API request was sent.",
    };
  }
  return {
    status: "READY" as const,
    message:
      "Domestic AI Live configuration matches the competition-provided endpoint contracts. No API request was sent.",
    providers: providerIds.map((providerId) => {
      const config = readDomesticAiLiveConfig(environment, providerId);
      return {
        providerId,
        model: config.model,
        protocol: "OPENAI_CHAT_COMPLETIONS" as const,
        endpointContractVerified: true,
      };
    }),
  };
}

export async function executeDomesticAiLiveSmoke(
  environment: Record<string, string | undefined>,
  providerIds: DomesticAiProviderId[],
  taskLimit?: number,
) {
  const missing = missingDomesticAiEnvironmentVariables(
    environment,
    providerIds,
  );
  if (missing.length > 0) {
    return {
      status: "NOT_CONFIGURED" as const,
      providerIds,
      missing,
      message:
        "Domestic AI Live smoke was not executed. Confirm provider-issued endpoint and auth documentation, then configure server-only variables locally.",
    };
  }
  const providers = providerIds.map((providerId) =>
    createDomesticAiLiveProvider({
      config: readDomesticAiLiveConfig(environment, providerId),
    }),
  );
  return {
    status: "COMPLETED" as const,
    run: await runDomesticAiBenchmark({
      providers,
      tasks: selectedDomesticAiTasks(taskLimit),
    }),
  };
}

export async function executeDomesticAiMockSmoke(
  providerIds: DomesticAiProviderId[] = [...domesticAiProviderIds],
  taskLimit?: number,
) {
  return {
    status: "COMPLETED" as const,
    run: await runDomesticAiBenchmark({
      providers: providerIds.map(createDomesticAiMockProvider),
      tasks: selectedDomesticAiTasks(taskLimit),
    }),
  };
}
