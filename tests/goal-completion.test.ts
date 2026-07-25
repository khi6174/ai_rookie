import { describe, expect, it } from "vitest";
import {
  evaluateGoalCompletionStatus,
  evaluateHumanGoalEvidence,
  parseFinalReleasePolicy,
} from "../src/evals/goalCompletion";

function g5(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "g5-spatial-comprehension-summary-v4",
    studyId: "g5-b-decision-spatial-comprehension-round4-001",
    dataMode: "DEMO",
    status: "KEEP_OPTIONAL",
    reviewerCount: 3,
    comprehensionPassed: true,
    ...overrides,
  };
}

function rider(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "rider-reference-comprehension-summary-v2",
    studyId: "rider-route-product-boundary-round2-001",
    dataMode: "DEMO",
    status: "READY_TO_PROMOTE",
    reviewerCount: 5,
    comprehensionPassed: true,
    criticalMisconceptionCount: 0,
    ...overrides,
  };
}

describe("최종 GOAL 사람 증거 계약", () => {
  it("유효한 G5 Round 4와 기사 Round 2 5인 결과만 전체 사람 Gate를 통과한다", () => {
    expect(evaluateHumanGoalEvidence({
      g5Round4: g5(),
      riderRound2: rider(),
    })).toEqual({
      g5Passed: true,
      riderPassed: true,
      allPassed: true,
      requiredNextEvidence: [],
    });
  });

  it("이전 Round·인원 부족·잘못된 study 계약은 완료 증거로 파싱하지 않는다", () => {
    expect(() => evaluateHumanGoalEvidence({
      g5Round4: g5({ schemaVersion: "g5-spatial-comprehension-summary-v3" }),
      riderRound2: rider(),
    })).toThrow();
    expect(() => evaluateHumanGoalEvidence({
      g5Round4: g5(),
      riderRound2: rider({ reviewerCount: 4 }),
    })).toThrow();
    expect(() => evaluateHumanGoalEvidence({
      g5Round4: g5(),
      riderRound2: rider({ studyId: "wrong-study" }),
    })).toThrow();
  });

  it("중대 제품 오인이나 G5 이해 실패는 해당 사람 증거를 대기로 유지한다", () => {
    const result = evaluateHumanGoalEvidence({
      g5Round4: g5({ status: "DO_NOT_PROMOTE", comprehensionPassed: false }),
      riderRound2: rider({
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
      "PASSED",
      "PASSED",
      "PASSED",
      "PASSED",
      "DISCLOSED_VALIDATION_GAP",
      "PASSED",
    ])).toBe("READY_FOR_DEMO_SUBMISSION_WITH_DISCLOSED_GAP");
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

  it("마감 공개 공백 정책은 관리자 Gate를 통과로 바꾸지 않는 고정 계약이다", () => {
    const policy = parseFinalReleasePolicy({
      schemaVersion: "saferoute-final-release-policy-v1",
      releaseScope: "AI_ROOKIE_DOMESTIC_TRACK_FINALS_DEMO",
      status: "APPROVED",
      approvedAt: "2026-07-25",
      humanValidationDisposition: {
        g5Round4: "WAIVED_DUE_TO_SUBMISSION_DEADLINE",
        riderRound2: "REQUIRED_AND_PASSED",
        waiverDoesNotEqualPass: true,
      },
      prohibitedClaims: [
        "관리자 공간 이해도 검증 완료",
        "실제 현장 사용성 검증 완료",
        "실제 사고감소 효과",
        "실시간 TMS·GPS·인증 운영 완료",
      ],
    });
    expect(policy.humanValidationDisposition.waiverDoesNotEqualPass).toBe(true);
    expect(() => parseFinalReleasePolicy({
      ...policy,
      humanValidationDisposition: {
        ...policy.humanValidationDisposition,
        waiverDoesNotEqualPass: false,
      },
    })).toThrow();
  });
});
