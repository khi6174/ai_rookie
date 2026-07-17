import { describe, expect, it } from "vitest";
import {
  createTemplateExplanation,
  generateExplanation,
} from "../src/application/explanations";
import {
  createUpstageLiveProvider,
  officialUpstageChatCompletionsUrl,
  readUpstageLiveConfig,
  validateUpstageLiveConfig,
  type UpstageLiveConfig,
} from "../src/adapters/upstage/live";
import { demoAdminExplanationInput } from "../src/ui/demoExplanation";

const receivedAt = "2026-07-14T00:12:00.000Z";

function liveConfig(
  overrides: Partial<UpstageLiveConfig> = {},
): UpstageLiveConfig {
  return {
    apiKey: "up_test_key_not_a_real_secret",
    model: "approved-model-from-server-config",
    chatCompletionsUrl: officialUpstageChatCompletionsUrl,
    timeoutMs: 5_000,
    maxPromptBytes: 32_000,
    maxResponseBytes: 64_000,
    ...overrides,
  };
}

function successfulResponse() {
  const output = createTemplateExplanation(demoAdminExplanationInput);
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("Upstage Live server configuration", () => {
  it("requires explicit model, timeout and size limits from server config", () => {
    expect(() =>
      readUpstageLiveConfig({
        UPSTAGE_API_KEY: "up_test_key_not_a_real_secret",
        UPSTAGE_MODEL: "",
      }),
    ).toThrow();
    expect(
      readUpstageLiveConfig({
        UPSTAGE_API_KEY: "up_test_key_not_a_real_secret",
        UPSTAGE_MODEL: "approved-model-from-server-config",
        UPSTAGE_TIMEOUT_MS: "5000",
        UPSTAGE_MAX_PROMPT_BYTES: "32000",
        UPSTAGE_MAX_RESPONSE_BYTES: "64000",
      }).chatCompletionsUrl,
    ).toBe(officialUpstageChatCompletionsUrl);
  });

  it("rejects non-HTTPS and non-Upstage endpoints", () => {
    for (const chatCompletionsUrl of [
      "http://api.upstage.ai/v1/chat/completions",
      "https://example.com/v1/chat/completions",
      "https://api.upstage.ai/v2/chat/completions",
    ]) {
      expect(() =>
        validateUpstageLiveConfig(liveConfig({ chatCompletionsUrl })),
      ).toThrow();
    }
  });
});

describe("Upstage Live HTTP adapter", () => {
  it("sends a server-only authenticated request and returns verified Live JSON", async () => {
    let requestedUrl = "";
    let authorization = "";
    let requestBody = "";
    const fakeFetch: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      requestBody = String(init?.body ?? "");
      return successfulResponse();
    };
    const result = await generateExplanation({
      input: demoAdminExplanationInput,
      provider: createUpstageLiveProvider({
        config: liveConfig(),
        fetchImplementation: fakeFetch,
      }),
      receivedAt,
    });
    expect(result.status).toBe("LIVE");
    expect(requestedUrl).toBe(officialUpstageChatCompletionsUrl);
    expect(authorization).toBe("Bearer up_test_key_not_a_real_secret");
    expect(requestBody).toContain("approved-model-from-server-config");
    expect(requestBody).toContain("Copy numeric displayValue strings exactly");
    const parsedRequest = JSON.parse(requestBody) as {
      messages: Array<{ content: string }>;
    };
    const userPayload = JSON.parse(parsedRequest.messages[1].content) as {
      outputContract: {
        dataModeLabel: string;
        nullValuesAllowed: boolean;
      };
      responseTemplate: {
        dataModeLabel: string;
        actions: string[];
        summary: string;
      };
    };
    expect(userPayload.outputContract.dataModeLabel).toBe("Demo fixture");
    expect(userPayload.outputContract.nullValuesAllowed).toBe(false);
    expect(userPayload.responseTemplate.dataModeLabel).toBe("Demo fixture");
    expect(userPayload.responseTemplate.actions).toEqual([
      "결정 근거와 기사 동의를 확인",
    ]);
    expect(userPayload.responseTemplate.summary).toContain("약 52분 후");
    expect(requestBody).not.toContain("up_test_key_not_a_real_secret");
    expect(result.data.dataModeLabel).toBe("Demo fixture");
  });

  it("maps authentication and rate-limit responses to verified Fallback", async () => {
    for (const [status, code] of [
      [401, "UNAUTHORIZED"],
      [429, "RATE_LIMITED"],
    ] as const) {
      const result = await generateExplanation({
        input: demoAdminExplanationInput,
        provider: createUpstageLiveProvider({
          config: liveConfig(),
          fetchImplementation: async () => new Response("", { status }),
        }),
        receivedAt,
      });
      expect(result.status).toBe("FALLBACK");
      if (result.status !== "FALLBACK") throw new Error("Expected fallback");
      expect(result.fallbackReason.code).toBe(code);
      expect(result.data.dataModeLabel).toBe("Demo fixture");
    }
  });

  it("maps provider timeout without exposing a raw error", async () => {
    const result = await generateExplanation({
      input: demoAdminExplanationInput,
      provider: createUpstageLiveProvider({
        config: liveConfig(),
        fetchImplementation: async () => {
          throw new DOMException("secret provider detail", "AbortError");
        },
      }),
      receivedAt,
    });
    expect(result.status).toBe("FALLBACK");
    if (result.status !== "FALLBACK") throw new Error("Expected fallback");
    expect(result.fallbackReason.code).toBe("TIMEOUT");
    expect(result.fallbackReason.message).not.toContain("secret");
  });

  it("rejects malformed completion envelopes and non-JSON content", async () => {
    for (const response of [
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "not-json" } }],
        }),
        { status: 200 },
      ),
    ]) {
      const result = await generateExplanation({
        input: demoAdminExplanationInput,
        provider: createUpstageLiveProvider({
          config: liveConfig(),
          fetchImplementation: async () => response.clone(),
        }),
        receivedAt,
      });
      expect(result.status).toBe("FALLBACK");
      if (result.status !== "FALLBACK") throw new Error("Expected fallback");
      expect(result.fallbackReason.code).toBe("MALFORMED_RESPONSE");
    }
  });

  it("blocks oversized prompts before transmitting them", async () => {
    let called = false;
    const result = await generateExplanation({
      input: demoAdminExplanationInput,
      provider: createUpstageLiveProvider({
        config: liveConfig({ maxPromptBytes: 1_024 }),
        fetchImplementation: async () => {
          called = true;
          return successfulResponse();
        },
      }),
      receivedAt,
    });
    expect(called).toBe(false);
    expect(result.status).toBe("FALLBACK");
    if (result.status !== "FALLBACK") throw new Error("Expected fallback");
    expect(result.fallbackReason.code).toBe("MALFORMED_RESPONSE");
  });

  it("blocks oversized responses before parsing provider content", async () => {
    const result = await generateExplanation({
      input: demoAdminExplanationInput,
      provider: createUpstageLiveProvider({
        config: liveConfig({ maxResponseBytes: 1_024 }),
        fetchImplementation: async () =>
          new Response("{}", {
            status: 200,
            headers: { "content-length": "2048" },
          }),
      }),
      receivedAt,
    });
    expect(result.status).toBe("FALLBACK");
    if (result.status !== "FALLBACK") throw new Error("Expected fallback");
    expect(result.fallbackReason.code).toBe("MALFORMED_RESPONSE");
  });
});
