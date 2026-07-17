import type { ExplanationInput } from "../domain/contracts";
import {
  ExplanationProviderError,
  type ExplanationFailureCode,
} from "../application/explanations";
import { buildExplanationChatRequest } from "../adapters/upstage/live";

export const domesticAiProviderIds = ["AX", "EXAONE"] as const;
export type DomesticAiProviderId = (typeof domesticAiProviderIds)[number];

export const competitionDocumentedDomesticAiEndpoints: Record<
  DomesticAiProviderId,
  { allowedHost: string; chatCompletionsUrl: string; documentedModel: string }
> = {
  AX: {
    allowedHost: "api.ax-k1.sktai.qa",
    chatCompletionsUrl:
      "https://api.ax-k1.sktai.qa/v1/chat/completions",
    documentedModel: "skt/A.X-K1",
  },
  EXAONE: {
    allowedHost: "api.friendli.ai",
    chatCompletionsUrl:
      "https://api.friendli.ai/serverless/v1/chat/completions",
    documentedModel: "LGAI-EXAONE/K-EXAONE-236B-A23B",
  },
};

export type DomesticAiUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type DomesticAiGeneration = {
  output: unknown;
  usage: DomesticAiUsage;
};

export type DomesticAiBenchmarkProvider = {
  providerId: DomesticAiProviderId;
  mode: "LIVE" | "MOCK";
  model: string;
  protocol: "OPENAI_CHAT_COMPLETIONS" | "MOCK";
  generate(input: ExplanationInput): Promise<DomesticAiGeneration>;
};

export type DomesticAiLiveConfig = {
  providerId: DomesticAiProviderId;
  apiKey: string;
  model: string;
  chatCompletionsUrl: string;
  allowedHost: string;
  timeoutMs: number;
  maxPromptBytes: number;
  maxResponseBytes: number;
};

type ServerEnvironment = Record<string, string | undefined>;
type FetchImplementation = typeof fetch;

const positiveInteger = (
  name: string,
  rawValue: string | undefined,
  minimum: number,
  maximum: number,
) => {
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be explicitly configured as an integer`);
  }
  const value = Number(rawValue);
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
};

export function requiredDomesticAiEnvironmentVariables(
  providerId: DomesticAiProviderId,
) {
  return [
    `${providerId}_API_KEY`,
    `${providerId}_MODEL`,
    `${providerId}_CHAT_COMPLETIONS_URL`,
    `${providerId}_ALLOWED_HOST`,
    "DOMESTIC_AI_TIMEOUT_MS",
    "DOMESTIC_AI_MAX_PROMPT_BYTES",
    "DOMESTIC_AI_MAX_RESPONSE_BYTES",
  ] as const;
}

export function missingDomesticAiEnvironmentVariables(
  environment: ServerEnvironment,
  providerIds: DomesticAiProviderId[],
) {
  return [...new Set(providerIds.flatMap(requiredDomesticAiEnvironmentVariables))]
    .filter((name) => !environment[name]?.trim());
}

export function validateDomesticAiLiveConfig(
  config: DomesticAiLiveConfig,
): DomesticAiLiveConfig {
  if (!domesticAiProviderIds.includes(config.providerId)) {
    throw new Error("Unsupported domestic AI provider");
  }
  if (config.apiKey.trim().length < 16) {
    throw new Error(`${config.providerId}_API_KEY is missing or too short`);
  }
  if (!config.model.trim()) {
    throw new Error(`${config.providerId}_MODEL must be explicitly configured`);
  }
  if (!/^[a-z0-9.-]+$/i.test(config.allowedHost)) {
    throw new Error(`${config.providerId}_ALLOWED_HOST must be a hostname only`);
  }
  const endpoint = new URL(config.chatCompletionsUrl);
  const documentedEndpoint = competitionDocumentedDomesticAiEndpoints[
    config.providerId
  ];
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hostname.toLowerCase() !== config.allowedHost.toLowerCase() ||
    endpoint.hostname.toLowerCase() !== documentedEndpoint.allowedHost ||
    endpoint.toString() !== documentedEndpoint.chatCompletionsUrl
  ) {
    throw new Error(
      `${config.providerId} endpoint must match the competition-provided HTTPS API contract`,
    );
  }
  if (
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < 1_000 ||
    config.timeoutMs > 60_000
  ) {
    throw new Error("Domestic AI timeout must be between 1000 and 60000 milliseconds");
  }
  if (
    !Number.isInteger(config.maxPromptBytes) ||
    config.maxPromptBytes < 1_024 ||
    config.maxPromptBytes > 256_000
  ) {
    throw new Error("Domestic AI prompt limit must be between 1024 and 256000 bytes");
  }
  if (
    !Number.isInteger(config.maxResponseBytes) ||
    config.maxResponseBytes < 1_024 ||
    config.maxResponseBytes > 1_000_000
  ) {
    throw new Error("Domestic AI response limit must be between 1024 and 1000000 bytes");
  }
  return {
    ...config,
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    allowedHost: endpoint.hostname.toLowerCase(),
    chatCompletionsUrl: endpoint.toString(),
  };
}

export function readDomesticAiLiveConfig(
  environment: ServerEnvironment,
  providerId: DomesticAiProviderId,
): DomesticAiLiveConfig {
  return validateDomesticAiLiveConfig({
    providerId,
    apiKey: environment[`${providerId}_API_KEY`] ?? "",
    model: environment[`${providerId}_MODEL`] ?? "",
    chatCompletionsUrl:
      environment[`${providerId}_CHAT_COMPLETIONS_URL`] ?? "",
    allowedHost: environment[`${providerId}_ALLOWED_HOST`] ?? "",
    timeoutMs: positiveInteger(
      "DOMESTIC_AI_TIMEOUT_MS",
      environment.DOMESTIC_AI_TIMEOUT_MS,
      1_000,
      60_000,
    ),
    maxPromptBytes: positiveInteger(
      "DOMESTIC_AI_MAX_PROMPT_BYTES",
      environment.DOMESTIC_AI_MAX_PROMPT_BYTES,
      1_024,
      256_000,
    ),
    maxResponseBytes: positiveInteger(
      "DOMESTIC_AI_MAX_RESPONSE_BYTES",
      environment.DOMESTIC_AI_MAX_RESPONSE_BYTES,
      1_024,
      1_000_000,
    ),
  });
}

const httpFailureCode = (status: number): ExplanationFailureCode => {
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "NETWORK_ERROR";
  return "MALFORMED_RESPONSE";
};

const nonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

function parseChatCompletion(responseText: string): DomesticAiGeneration {
  let envelope: unknown;
  try {
    envelope = JSON.parse(responseText);
  } catch {
    throw new ExplanationProviderError("MALFORMED_RESPONSE");
  }
  if (typeof envelope !== "object" || envelope === null) {
    throw new ExplanationProviderError("MALFORMED_RESPONSE");
  }
  const choices = "choices" in envelope ? envelope.choices : undefined;
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const message =
    typeof firstChoice === "object" && firstChoice !== null && "message" in firstChoice
      ? firstChoice.message
      : undefined;
  const content =
    typeof message === "object" && message !== null && "content" in message
      ? message.content
      : undefined;
  if (typeof content !== "string") {
    throw new ExplanationProviderError("MALFORMED_RESPONSE");
  }
  let output: unknown;
  try {
    output = JSON.parse(content);
  } catch {
    throw new ExplanationProviderError("MALFORMED_RESPONSE");
  }
  const usage = "usage" in envelope && typeof envelope.usage === "object" && envelope.usage
    ? envelope.usage
    : {};
  return {
    output,
    usage: {
      promptTokens:
        "prompt_tokens" in usage
          ? nonNegativeInteger(usage.prompt_tokens)
          : undefined,
      completionTokens:
        "completion_tokens" in usage
          ? nonNegativeInteger(usage.completion_tokens)
          : undefined,
      totalTokens:
        "total_tokens" in usage
          ? nonNegativeInteger(usage.total_tokens)
          : undefined,
    },
  };
}

export function createDomesticAiLiveProvider({
  config: rawConfig,
  fetchImplementation = fetch,
}: {
  config: DomesticAiLiveConfig;
  fetchImplementation?: FetchImplementation;
}): DomesticAiBenchmarkProvider {
  const config = validateDomesticAiLiveConfig(rawConfig);
  return {
    providerId: config.providerId,
    mode: "LIVE",
    model: config.model,
    protocol: "OPENAI_CHAT_COMPLETIONS",
    generate: async (input) => {
      if (typeof window !== "undefined") {
        throw new ExplanationProviderError(
          "UNAUTHORIZED",
          "Domestic AI benchmark providers are server-only",
        );
      }
      const requestBody = JSON.stringify(
        buildExplanationChatRequest(input, config.model),
      );
      if (new TextEncoder().encode(requestBody).byteLength > config.maxPromptBytes) {
        throw new ExplanationProviderError("MALFORMED_RESPONSE");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImplementation(config.chatCompletionsUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new ExplanationProviderError(httpFailureCode(response.status));
        }
        const declaredLength = Number(response.headers.get("content-length"));
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > config.maxResponseBytes
        ) {
          throw new ExplanationProviderError("MALFORMED_RESPONSE");
        }
        const responseText = await response.text();
        if (
          new TextEncoder().encode(responseText).byteLength >
          config.maxResponseBytes
        ) {
          throw new ExplanationProviderError("MALFORMED_RESPONSE");
        }
        return parseChatCompletion(responseText);
      } catch (error) {
        if (error instanceof ExplanationProviderError) throw error;
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          throw new ExplanationProviderError("TIMEOUT");
        }
        throw new ExplanationProviderError("NETWORK_ERROR");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
