import { describe, expect, it, vi } from "vitest";
import {
  ExplanationProviderError,
  type ExplanationFailureCode,
} from "../src/application/explanations";
import {
  runDomesticAiExplanationCascade,
  type DomesticAiCascadeProvider,
} from "../src/application/explanations/cascade";
import {
  ExplanationInputSchema,
  type ExplanationInput,
  type ExplanationOutput,
} from "../src/domain/contracts";

const receivedAt = "2026-08-05T09:00:00.000Z";
const fixedNow = () => new Date(receivedAt);

function input(withCitation = true): ExplanationInput {
  return ExplanationInputSchema.parse({
    requestId: "cascade-explanation-demo-001",
    role: "ADMIN",
    language: "ko",
    dataMode: "DEMO",
    numericFacts: [
      {
        factId: "safety-budget-after",
        label: "조정 후 안전여유",
        value: 47.2,
        unit: "budget_points",
        displayValue: "47.2",
      },
    ],
    stateFacts: [
      {
        factId: "decision-state",
        label: "결정 상태",
        value: "기사 응답 대기",
      },
    ],
    allowedCitations: withCitation
      ? [
          {
            citationId: "citation-cascade-001",
            documentTitle: "합성 안전운영 문서",
            section: "지원 기준",
            excerpt: "검증된 조정안만 기사에게 안내한다.",
          },
        ]
      : [],
    allowedActions: ["기사 확인 요청"],
    prohibitedTopics: ["기사 평가", "사고확률"],
  });
}

function validOutput(value: ExplanationInput): ExplanationOutput {
  return {
    requestId: value.requestId,
    role: value.role,
    summary: "조정 후 안전여유 47.2이며 결정 상태는 기사 응답 대기입니다.",
    actions: ["기사 확인 요청"],
    citedFactIds: ["safety-budget-after", "decision-state"],
    citationIds: value.allowedCitations.map((item) => item.citationId),
    uncertaintyStatement: "검증된 입력 범위만 설명했습니다.",
    dataModeLabel: "Demo fixture",
  };
}

function provider(
  overrides: Partial<DomesticAiCascadeProvider> &
    Pick<DomesticAiCascadeProvider, "providerId" | "tier">,
): DomesticAiCascadeProvider {
  const value = input();
  return {
    mode: "MOCK",
    model: `${overrides.providerId.toLowerCase()}-mock-v1`,
    capabilities: [
      "ROLE_EXPLANATION",
      "CITATION_GROUNDED_EXPLANATION",
    ],
    generate: async () => ({ output: validOutput(value) }),
    ...overrides,
    providerId: overrides.providerId,
    tier: overrides.tier,
  };
}

describe("domestic AI explanation cascade", () => {
  it("accepts a verified local output and does not call Hosted providers", async () => {
    const value = input();
    const hostedGenerate = vi.fn(async () => ({ output: validOutput(value) }));
    const result = await runDomesticAiExplanationCascade({
      input: value,
      localProvider: provider({ providerId: "AX_LOCAL", tier: "LOCAL" }),
      hostedProviders: [
        provider({
          providerId: "AX",
          tier: "HOSTED",
          generate: hostedGenerate,
        }),
      ],
      receivedAt,
      now: fixedNow,
    });

    expect(result.status).toBe("VERIFIED_LOCAL");
    expect(result.providerId).toBe("AX_LOCAL");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].status).toBe("VERIFIED");
    expect(hostedGenerate).not.toHaveBeenCalled();
  });

  it("rejects an unsupported local number and escalates to a verified Hosted provider", async () => {
    const value = input();
    const result = await runDomesticAiExplanationCascade({
      input: value,
      localProvider: provider({
        providerId: "AX_LOCAL",
        tier: "LOCAL",
        generate: async () => ({
          output: {
            ...validOutput(value),
            summary: "조정 후 안전여유 48.0입니다.",
          },
        }),
      }),
      hostedProviders: [provider({ providerId: "AX", tier: "HOSTED" })],
      receivedAt,
      now: fixedNow,
    });

    expect(result.status).toBe("VERIFIED_HOSTED");
    expect(result.providerId).toBe("AX");
    expect(result.attempts.map((attempt) => attempt.status)).toEqual([
      "REJECTED",
      "VERIFIED",
    ]);
    expect(result.attempts[0].failureCode).toBe("UNSUPPORTED_NUMERIC_CLAIM");
    expect(result.data.summary).toContain("47.2");
  });

  it("uses declared capability instead of model self-confidence for routing", async () => {
    const value = input();
    const result = await runDomesticAiExplanationCascade({
      input: value,
      localProvider: provider({
        providerId: "AX_LOCAL",
        tier: "LOCAL",
        capabilities: ["ROLE_EXPLANATION"],
      }),
      hostedProviders: [
        provider({
          providerId: "EXAONE",
          tier: "HOSTED",
          capabilities: ["ROLE_EXPLANATION"],
        }),
        provider({ providerId: "UPSTAGE", tier: "HOSTED" }),
      ],
      receivedAt,
      now: fixedNow,
    });

    expect(result.status).toBe("VERIFIED_HOSTED");
    expect(result.providerId).toBe("UPSTAGE");
    expect(result.attempts.map((attempt) => attempt.failureCode)).toEqual([
      "UNSUPPORTED_CAPABILITY",
      "UNSUPPORTED_CAPABILITY",
      undefined,
    ]);
  });

  it("records an unqualified local slot and uses Hosted without claiming local inference", async () => {
    const value = input();
    const result = await runDomesticAiExplanationCascade({
      input: value,
      hostedProviders: [provider({ providerId: "AX", tier: "HOSTED" })],
      receivedAt,
      now: fixedNow,
    });

    expect(result.status).toBe("VERIFIED_HOSTED");
    expect(result.attempts[0]).toMatchObject({
      providerId: "AX_LOCAL",
      status: "SKIPPED",
      failureCode: "LOCAL_PROVIDER_NOT_QUALIFIED",
    });
    expect(result.attempts[1].providerId).toBe("AX");
  });

  it("falls back to the deterministic template when every AI attempt fails", async () => {
    const value = input(false);
    const failingProvider = (
      providerId: "AX_LOCAL" | "AX" | "EXAONE",
      tier: "LOCAL" | "HOSTED",
      code: ExplanationFailureCode,
    ) =>
      provider({
        providerId,
        tier,
        capabilities: ["ROLE_EXPLANATION"],
        generate: async () => {
          throw new ExplanationProviderError(code);
        },
      });
    const result = await runDomesticAiExplanationCascade({
      input: value,
      localProvider: failingProvider("AX_LOCAL", "LOCAL", "TIMEOUT"),
      hostedProviders: [
        failingProvider("AX", "HOSTED", "RATE_LIMITED"),
        failingProvider("EXAONE", "HOSTED", "MALFORMED_RESPONSE"),
      ],
      receivedAt,
      now: fixedNow,
    });

    expect(result.status).toBe("FALLBACK");
    expect(result.providerId).toBe("TEMPLATE");
    expect(result.data.summary).toContain("47.2");
    expect(result.attempts.map((attempt) => attempt.failureCode)).toEqual([
      "TIMEOUT",
      "RATE_LIMITED",
      "MALFORMED_RESPONSE",
    ]);
    expect(JSON.stringify(result.attempts)).not.toContain("summary");
  });

  it("rejects a non-domestic or mis-tiered provider contract", async () => {
    await expect(
      runDomesticAiExplanationCascade({
        input: input(),
        localProvider: provider({ providerId: "AX", tier: "LOCAL" }),
        hostedProviders: [],
        receivedAt,
      }),
    ).rejects.toThrow("AX_LOCAL");
  });

  it("validates input before sending anything to a provider", async () => {
    const generate = vi.fn(async () => ({ output: validOutput(input()) }));
    const invalidInput = {
      ...input(),
      dataMode: "UNDECLARED",
    } as unknown as ExplanationInput;

    await expect(
      runDomesticAiExplanationCascade({
        input: invalidInput,
        localProvider: provider({
          providerId: "AX_LOCAL",
          tier: "LOCAL",
          generate,
        }),
        hostedProviders: [],
        receivedAt,
      }),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
});
