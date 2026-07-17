import { describe, expect, it } from "vitest";
import {
  createTemplateExplanation,
  validateExplanationOutput,
} from "../src/application/explanations";
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
  validateDomesticAiLiveConfig,
  type DomesticAiLiveConfig,
} from "../src/evals/domesticAiProvider";
import {
  checkDomesticAiLiveConfiguration,
  executeDomesticAiMockSmoke,
} from "../scripts/domestic-ai-smoke-entry";

const apiKey = "domestic_test_key_not_a_real_secret";

function liveConfig(
  overrides: Partial<DomesticAiLiveConfig> = {},
): DomesticAiLiveConfig {
  return {
    providerId: "AX",
    apiKey,
    model: "provider-issued-model-id",
    chatCompletionsUrl:
      "https://api.ax-k1.sktai.qa/v1/chat/completions",
    allowedHost: "api.ax-k1.sktai.qa",
    timeoutMs: 5_000,
    maxPromptBytes: 32_000,
    maxResponseBytes: 64_000,
    ...overrides,
  };
}

function successfulResponse() {
  const output = createTemplateExplanation(domesticAiBenchmarkTasks[0].input);
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
      },
    }),
    { status: 200 },
  );
}

describe("domestic AI benchmark configuration", () => {
  it("requires every selected provider and common operational variable", () => {
    expect(
      missingDomesticAiEnvironmentVariables({}, ["AX", "EXAONE"]),
    ).toEqual(
      expect.arrayContaining([
        "AX_API_KEY",
        "EXAONE_API_KEY",
        "DOMESTIC_AI_TIMEOUT_MS",
      ]),
    );
    expect(
      missingDomesticAiEnvironmentVariables(
        {
          AX_API_KEY: apiKey,
          AX_MODEL: "model",
          AX_CHAT_COMPLETIONS_URL:
            "https://api.test-provider.example/v1/chat/completions",
          AX_ALLOWED_HOST: "api.test-provider.example",
          DOMESTIC_AI_TIMEOUT_MS: "5000",
          DOMESTIC_AI_MAX_PROMPT_BYTES: "32000",
          DOMESTIC_AI_MAX_RESPONSE_BYTES: "64000",
        },
        ["AX"],
      ),
    ).toEqual([]);
  });

  it("rejects guessed HTTP, host-mismatched, and non-chat endpoints", () => {
    for (const config of [
      liveConfig({ chatCompletionsUrl: "http://api.ax-k1.sktai.qa/v1/chat/completions" }),
      liveConfig({ allowedHost: "other.example" }),
      liveConfig({
        chatCompletionsUrl: "https://api.ax-k1.sktai.qa/v2/generate",
      }),
    ]) {
      expect(() => validateDomesticAiLiveConfig(config)).toThrow();
    }
  });

  it("reads explicit server-only configuration without defaulting a model or URL", () => {
    expect(() => readDomesticAiLiveConfig({}, "EXAONE")).toThrow();
    const config = readDomesticAiLiveConfig(
      {
        EXAONE_API_KEY: apiKey,
        EXAONE_MODEL: "provider-issued-model-id",
        EXAONE_CHAT_COMPLETIONS_URL:
          "https://api.friendli.ai/serverless/v1/chat/completions",
        EXAONE_ALLOWED_HOST: "api.friendli.ai",
        DOMESTIC_AI_TIMEOUT_MS: "5000",
        DOMESTIC_AI_MAX_PROMPT_BYTES: "32000",
        DOMESTIC_AI_MAX_RESPONSE_BYTES: "64000",
      },
      "EXAONE",
    );
    expect(config.providerId).toBe("EXAONE");
    expect(config.model).toBe("provider-issued-model-id");
  });

  it("checks both provider contracts without exposing keys or sending requests", () => {
    const result = checkDomesticAiLiveConfiguration(
      {
        AX_API_KEY: apiKey,
        AX_MODEL: "skt/A.X-K1",
        AX_CHAT_COMPLETIONS_URL:
          "https://api.ax-k1.sktai.qa/v1/chat/completions",
        AX_ALLOWED_HOST: "api.ax-k1.sktai.qa",
        EXAONE_API_KEY: `${apiKey}_exaone`,
        EXAONE_MODEL: "LGAI-EXAONE/K-EXAONE-236B-A23B",
        EXAONE_CHAT_COMPLETIONS_URL:
          "https://api.friendli.ai/serverless/v1/chat/completions",
        EXAONE_ALLOWED_HOST: "api.friendli.ai",
        DOMESTIC_AI_TIMEOUT_MS: "5000",
        DOMESTIC_AI_MAX_PROMPT_BYTES: "32000",
        DOMESTIC_AI_MAX_RESPONSE_BYTES: "64000",
      },
      ["AX", "EXAONE"],
    );
    expect(result.status).toBe("READY");
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(JSON.stringify(result)).not.toContain("chatCompletionsUrl");
  });

  it("can limit a diagnostic run to one common task", async () => {
    const result = await executeDomesticAiMockSmoke(["EXAONE"], 1);
    expect(result.run.taskCountPerProvider).toBe(1);
    expect(result.run.providers[0].taskCount).toBe(1);
    await expect(
      executeDomesticAiMockSmoke(["EXAONE"], 13),
    ).rejects.toThrow("between 1 and 12");
  });
});

describe("domestic AI OpenAI-compatible HTTP adapter", () => {
  it("sends Bearer auth only in headers and parses content plus usage", async () => {
    let authorization = "";
    let requestBody = "";
    const generation = await createDomesticAiLiveProvider({
      config: liveConfig(),
      fetchImplementation: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        requestBody = String(init?.body ?? "");
        return successfulResponse();
      },
    }).generate(domesticAiBenchmarkTasks[0].input);

    expect(authorization).toBe(`Bearer ${apiKey}`);
    expect(requestBody).not.toContain(apiKey);
    expect(requestBody).toContain("provider-issued-model-id");
    expect(generation.usage).toEqual({
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
    });
    expect(() =>
      validateExplanationOutput(
        domesticAiBenchmarkTasks[0].input,
        generation.output,
      ),
    ).not.toThrow();
  });

  it("maps authentication, rate limit, malformed, and timeout failures", async () => {
    for (const [response, expectedCode] of [
      [new Response("", { status: 401 }), "UNAUTHORIZED"],
      [new Response("", { status: 429 }), "RATE_LIMITED"],
      [new Response(JSON.stringify({ choices: [] }), { status: 200 }), "MALFORMED_RESPONSE"],
    ] as const) {
      await expect(
        createDomesticAiLiveProvider({
          config: liveConfig(),
          fetchImplementation: async () => response.clone(),
        }).generate(domesticAiBenchmarkTasks[0].input),
      ).rejects.toMatchObject({ code: expectedCode });
    }
    await expect(
      createDomesticAiLiveProvider({
        config: liveConfig(),
        fetchImplementation: async () => {
          throw new DOMException("private provider detail", "AbortError");
        },
      }).generate(domesticAiBenchmarkTasks[0].input),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("common A.X and EXAONE text benchmark", () => {
  it("runs the same 12 tasks for both Mock providers", async () => {
    const run = await runDomesticAiBenchmark({
      providers: domesticAiProviderIds.map(createDomesticAiMockProvider),
      nowIso: () => "2026-07-17T00:00:00.000Z",
    });
    expect(run.providerCount).toBe(2);
    expect(run.taskCountPerProvider).toBe(12);
    expect(run.providers.map((provider) => provider.providerId)).toEqual([
      "AX",
      "EXAONE",
    ]);
    expect(
      run.providers.every(
        (provider) =>
          provider.metrics.passed === 12 &&
          provider.metrics.failed === 0 &&
          provider.metrics.unsafeDisplayCount === 0,
      ),
    ).toBe(true);
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain("messages");
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("chatCompletionsUrl");
  });

  it("records display omission as Fallback without storing raw output", async () => {
    const task = domesticAiBenchmarkTasks[0];
    const output = createTemplateExplanation(task.input);
    output.summary = "검증된 결정 사실만 확인합니다.";
    const run = await runDomesticAiBenchmark({
      providers: [
        {
          providerId: "AX",
          mode: "MOCK",
          model: "omission-mock",
          protocol: "MOCK",
          generate: async () => ({ output, usage: {} }),
        },
      ],
      tasks: [task],
    });
    expect(run.providers[0].results[0]).toMatchObject({
      passed: false,
      status: "FALLBACK",
      fallbackCode: "DISPLAY_VALUE_OMISSION",
    });
    expect(JSON.stringify(run)).not.toContain(output.summary);
  });
});
