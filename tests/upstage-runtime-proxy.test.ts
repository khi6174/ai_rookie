import { describe, expect, it, vi } from "vitest";
import { createUpstageProxyProvider } from "../src/adapters/upstage";
import {
  generateExplanation,
} from "../src/application/explanations";
import { ExplanationInputSchema } from "../src/domain/contracts";
import { handleUpstageExplanationRequest } from "../server/upstage-explanation-proxy.mjs";

const input = ExplanationInputSchema.parse({
  requestId: "operations-explanation-decision-demo-001",
  role: "ADMIN",
  language: "ko",
  dataMode: "DEMO",
  numericFacts: [
    {
      factId: "current-budget",
      label: "현재 안전여유",
      value: 52.1,
      unit: "budget_points",
      displayValue: "52.1",
    },
    {
      factId: "minimum-budget",
      label: "조정 후 최저",
      value: 54,
      unit: "budget_points",
      displayValue: "54.0",
    },
  ],
  stateFacts: [
    {
      factId: "decision-state",
      label: "결정 상태",
      value: "기사 응답 대기",
    },
  ],
  allowedCitations: [],
  allowedActions: ["기사 동의 상태 확인"],
  prohibitedTopics: ["기사 평가", "징계", "사고확률"],
});

const providerOutput = {
  requestId: input.requestId,
  role: input.role,
  summary:
    "검증된 결정 근거입니다. 현재 안전여유 52.1, 조정 후 최저 54.0, 결정 상태 기사 응답 대기.",
  actions: ["기사 동의 상태 확인"],
  citedFactIds: [
    "current-budget",
    "minimum-budget",
    "decision-state",
  ],
  citationIds: [],
  uncertaintyStatement: "입력 신뢰도와 결측 상태만 사용했습니다.",
  dataModeLabel: "Demo fixture",
};

describe("Upstage runtime explanation proxy", () => {
  it("keeps the secret server-side and returns provider JSON", async () => {
    const upstreamFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer up_test_key_not_a_real_secret",
      });
      expect(String(init?.body)).not.toContain(
        "up_test_key_not_a_real_secret",
      );
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(providerOutput) } }],
        }),
        { status: 200 },
      );
    });
    const response = await handleUpstageExplanationRequest(
      new Request("https://demo.example/api/upstage-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
      {
        apiKey: "up_test_key_not_a_real_secret",
        model: "solar-test-model",
        fetchImplementation: upstreamFetch,
      },
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      status: "LIVE",
      provider: "UPSTAGE",
      model: "solar-test-model",
      output: providerOutput,
    });
  });

  it("validates the proxy output and falls back explicitly on provider failure", async () => {
    const live = await generateExplanation({
      input,
      provider: createUpstageProxyProvider({
        fetchImplementation: async () =>
          new Response(
            JSON.stringify({
              status: "LIVE",
              provider: "UPSTAGE",
              model: "solar-test-model",
              output: providerOutput,
            }),
            { status: 200 },
          ),
      }),
      receivedAt: "2026-07-27T02:00:00.000Z",
    });
    expect(live.status).toBe("LIVE");

    const fallback = await generateExplanation({
      input,
      provider: createUpstageProxyProvider({
        fetchImplementation: async () =>
          new Response(
            JSON.stringify({
              code: "RATE_LIMITED",
              error: "rate limit",
            }),
            { status: 502 },
          ),
      }),
      receivedAt: "2026-07-27T02:01:00.000Z",
    });
    expect(fallback.status).toBe("FALLBACK");
    if (fallback.status === "FALLBACK") {
      expect(fallback.fallbackReason.code).toBe("RATE_LIMITED");
      expect(fallback.data.summary).toContain("52.1");
      expect(fallback.data.summary).toContain("54.0");
    }
  });

  it("rejects PII before sending anything upstream", async () => {
    const upstreamFetch = vi.fn();
    const response = await handleUpstageExplanationRequest(
      new Request("https://demo.example/api/upstage-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          stateFacts: [
            ...input.stateFacts,
            {
              factId: "forbidden",
              label: "연락처",
              value: "010-1234-5678",
            },
          ],
        }),
      }),
      {
        apiKey: "up_test_key_not_a_real_secret",
        model: "solar-test-model",
        fetchImplementation: upstreamFetch,
      },
    );
    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("휴대전화번호");
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
