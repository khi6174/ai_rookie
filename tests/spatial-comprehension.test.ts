import { describe, expect, it } from "vitest";
import {
  evaluateSpatialComprehension,
  SpatialComprehensionStudySchema,
  type SpatialComprehensionStudy,
} from "../src/evals/spatialComprehension";

function trial(
  mode: "TWO_D" | "DEMO_TWO_POINT_FIVE_D",
  durationMs: number,
): SpatialComprehensionStudy["reviewers"][number]["trials"][number] {
  return {
    mode,
    durationMs,
    confidence: 4,
    answers: {
      timeToBreachMinutes: 52,
      breachStopOrdinal: 17,
      slopeExposureSegment: "REST_TO_BREACH" as const,
      restMinutes: 10,
      transferStopCount: 8,
      sourceImpact: "WORKLOAD_REDUCED_AND_BUDGET_RECOVERS" as const,
      recipientImpact: "TRANSFER_WITHIN_SAFETY_LIMIT" as const,
      routePriority: "REST_BEFORE_BREACH" as const,
    },
  };
}

function study() {
  return {
    schemaVersion: "g5-spatial-comprehension-v1" as const,
    studyId: "g5-b-decision-spatial-comprehension-001" as const,
    dataMode: "DEMO" as const,
    stimulusManifest: "artifacts/evals/g5-spatial-stimulus-manifest.json" as const,
    reviewers: [
      {
        reviewerId: "reviewer-01",
        trialOrder: ["TWO_D", "DEMO_TWO_POINT_FIVE_D"] as const,
        trials: [trial("TWO_D", 42_000), trial("DEMO_TWO_POINT_FIVE_D", 27_000)],
        comparison: { clearerMode: "DEMO_TWO_POINT_FIVE_D" as const, twoPointFiveDAddedConfusion: false, comment: "경사 구간이 더 빨리 보임" },
      },
      {
        reviewerId: "reviewer-02",
        trialOrder: ["DEMO_TWO_POINT_FIVE_D", "TWO_D"] as const,
        trials: [trial("DEMO_TWO_POINT_FIVE_D", 31_000), trial("TWO_D", 44_000)],
        comparison: { clearerMode: "DEMO_TWO_POINT_FIVE_D" as const, twoPointFiveDAddedConfusion: false, comment: "" },
      },
      {
        reviewerId: "reviewer-03",
        trialOrder: ["TWO_D", "DEMO_TWO_POINT_FIVE_D"] as const,
        trials: [trial("TWO_D", 39_000), trial("DEMO_TWO_POINT_FIVE_D", 30_000)],
        comparison: { clearerMode: "SAME" as const, twoPointFiveDAddedConfusion: false, comment: "" },
      },
    ],
  };
}

describe("G5-B 공간 이해도 평가", () => {
  it("독립 검토 3명의 정확성과 속도 조건을 판정한다", () => {
    const result = evaluateSpatialComprehension(study());
    expect(result).toMatchObject({
      status: "DEFAULT_PROMOTION_CANDIDATE",
      reviewerCount: 3,
      totalTrials: 6,
      correctTrials: 6,
      answerAccuracy: 1,
      criticalMisinterpretationCount: 0,
      defaultPromotionEligible: true,
    });
  });

  it("수치 또는 경로 우선순위 오답 하나도 기본 승격을 차단한다", () => {
    const input = study();
    input.reviewers[1].trials[0].answers.breachStopOrdinal = 18;
    const result = evaluateSpatialComprehension(input);
    expect(result.status).toBe("DO_NOT_PROMOTE");
    expect(result.criticalMisinterpretationCount).toBe(1);
    expect(result.comprehensionPassed).toBe(false);
  });

  it("2D 경사 구간 미인지는 기록하되 2.5D 경사 오답은 기본 승격을 막는다", () => {
    const input = study();
    input.reviewers[0].trials[0].answers.slopeExposureSegment = "UNKNOWN";
    let result = evaluateSpatialComprehension(input);
    expect(result.comprehensionPassed).toBe(true);
    expect(result.status).toBe("DEFAULT_PROMOTION_CANDIDATE");
    expect(result.slopeCorrectByMode.TWO_D).toBe(2);

    input.reviewers[0].trials[1].answers.slopeExposureSegment = "UNKNOWN";
    result = evaluateSpatialComprehension(input);
    expect(result.status).toBe("KEEP_OPTIONAL");
    expect(result.twoPointFiveDSlopePassed).toBe(false);
  });

  it("동일 노출 순서와 익명 ID 외 필드를 거부한다", () => {
    const input = study();
    input.reviewers[1].trialOrder = ["TWO_D", "DEMO_TWO_POINT_FIVE_D"];
    input.reviewers[1].trials = [trial("TWO_D", 40_000), trial("DEMO_TWO_POINT_FIVE_D", 30_000)];
    expect(() => SpatialComprehensionStudySchema.parse(input)).toThrow(
      /counterbalanced/,
    );

    const withPii = {
      ...study(),
      reviewers: study().reviewers.map((reviewer, index) =>
        index === 0 ? { ...reviewer, name: "실명 금지" } : reviewer,
      ),
    };
    expect(() => SpatialComprehensionStudySchema.parse(withPii)).toThrow();
  });
});
