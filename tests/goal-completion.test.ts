import { describe, expect, it } from "vitest";
import {
  evaluateGoalCompletionStatus,
  evaluateHumanGoalEvidence,
} from "../src/evals/goalCompletion";

function g5(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "g5-spatial-comprehension-summary-v2",
    studyId: "g5-b-decision-spatial-comprehension-round2-001",
    dataMode: "DEMO",
    status: "KEEP_OPTIONAL",
    reviewerCount: 3,
    comprehensionPassed: true,
    ...overrides,
  };
}

function rider(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "rider-reference-comprehension-summary-v1",
    studyId: "rider-route-product-boundary-001",
    dataMode: "DEMO",
    status: "READY_TO_PROMOTE",
    reviewerCount: 5,
    comprehensionPassed: true,
    criticalMisconceptionCount: 0,
    ...overrides,
  };
}

describe("최종 GOAL 사람 증거 계약", () => {
  it("유효한 G5 Round 2와 기사 5인 결과만 전체 사람 Gate를 통과한다", () => {
    expect(evaluateHumanGoalEvidence({
      g5Round2: g5(),
      riderReference: rider(),
    })).toEqual({
      g5Passed: true,
      riderPassed: true,
      allPassed: true,
      requiredNextEvidence: [],
    });
  });

  it("Round 1·인원 부족·잘못된 study 계약은 완료 증거로 파싱하지 않는다", () => {
    expect(() => evaluateHumanGoalEvidence({
      g5Round2: g5({ schemaVersion: "g5-spatial-comprehension-summary-v1" }),
      riderReference: rider(),
    })).toThrow();
    expect(() => evaluateHumanGoalEvidence({
      g5Round2: g5(),
      riderReference: rider({ reviewerCount: 4 }),
    })).toThrow();
    expect(() => evaluateHumanGoalEvidence({
      g5Round2: g5(),
      riderReference: rider({ studyId: "wrong-study" }),
    })).toThrow();
  });

  it("중대 제품 오인이나 G5 이해 실패는 해당 사람 증거를 대기로 유지한다", () => {
    const result = evaluateHumanGoalEvidence({
      g5Round2: g5({ status: "DO_NOT_PROMOTE", comprehensionPassed: false }),
      riderReference: rider({
        status: "NEEDS_REVISION",
        comprehensionPassed: false,
        criticalMisconceptionCount: 1,
      }),
    });
    expect(result.allPassed).toBe(false);
    expect(result.requiredNextEvidence).toHaveLength(2);
  });

  it("여섯 기준만 최종 상태를 만들고 실패가 사람 대기보다 우선한다", () => {
    expect(evaluateGoalCompletionStatus([
      "PASSED",
      "PASSED",
      "PASSED",
      "PASSED",
      "PASSED",
      "PASSED",
    ])).toBe("READY_FOR_FINAL_SUBMISSION");
    expect(evaluateGoalCompletionStatus([
      "PASSED",
      "PASSED",
      "PASSED",
      "PASSED",
      "HUMAN_VALIDATION_REQUIRED",
      "PASSED",
    ])).toBe("HUMAN_VALIDATION_REQUIRED");
    expect(evaluateGoalCompletionStatus([
      "FAILED",
      "PASSED",
      "PASSED",
      "PASSED",
      "HUMAN_VALIDATION_REQUIRED",
      "PASSED",
    ])).toBe("FAILED");
    expect(() => evaluateGoalCompletionStatus(["PASSED"])).toThrow(/six/);
  });
});
