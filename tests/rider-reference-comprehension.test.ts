import { describe, expect, it } from "vitest";
import {
  evaluateRiderReferenceComprehension,
  RiderReferenceComprehensionStudySchema,
  type RiderReferenceComprehensionStudy,
} from "../src/evals/riderReferenceComprehension";

function reviewer(
  index: number,
): RiderReferenceComprehensionStudy["reviewers"][number] {
  return {
    reviewerId: `reviewer-${String(index).padStart(2, "0")}`,
    consentConfirmed: true,
    durationMs: 30_000 + index * 1_000,
    confidence: 4,
    answers: {
      currentSegment: "FOURTEENTH_DELIVERY_SEGMENT",
      nextSafetyStop: "TEN_MINUTE_REST",
      supportBoundary: "BEFORE_SEVENTEENTH_DELIVERY",
      productRole: "SAFETY_OPERATION_DECISION_LAYER",
      approvalRule: "RIDER_AND_ADMIN_REQUIRED",
      demoBoundary: "DEMO_ROUTE_NO_LIVE_GPS",
    },
    comment: "합성 화면 이해도 검토",
  };
}

function study(): RiderReferenceComprehensionStudy {
  return {
    schemaVersion: "rider-reference-comprehension-v1",
    studyId: "rider-route-product-boundary-001",
    dataMode: "DEMO",
    stimulusManifest:
      "artifacts/evals/rider-reference-stimulus-manifest.json",
    reviewers: [1, 2, 3, 4, 5].map(reviewer),
  };
}

describe("기사 경로·제품 경계 이해도 평가", () => {
  it("5명이 경로·제품 역할·승인·Demo 경계를 이해하면 승격 후보로 판정한다", () => {
    const result = evaluateRiderReferenceComprehension(study());
    expect(result).toMatchObject({
      status: "READY_TO_PROMOTE",
      reviewerCount: 5,
      questionCount: 6,
      totalAnswerCount: 30,
      correctAnswerCount: 30,
      taskAccuracy: 1,
      fullyCorrectReviewerCount: 5,
      fullyCorrectReviewerRate: 1,
      criticalMisconceptionCount: 0,
      comprehensionPassed: true,
    });
  });

  it("한 명의 경로 오답은 허용 임계 안에서 기록하되 완전 정답률을 낮춘다", () => {
    const input = study();
    input.reviewers[0].answers.currentSegment = "UNKNOWN";
    const result = evaluateRiderReferenceComprehension(input);
    expect(result.status).toBe("READY_TO_PROMOTE");
    expect(result.correctAnswerCount).toBe(29);
    expect(result.fullyCorrectReviewerCount).toBe(4);
    expect(result.criticalMisconceptionCount).toBe(0);
  });

  it("실시간 GPS·자동 적용·사고 구조로 오인한 응답 하나도 승격을 차단한다", () => {
    const input = study();
    input.reviewers[2].answers.productRole = "ACCIDENT_DETECTION_AND_RESCUE";
    input.reviewers[2].answers.approvalRule = "AUTOMATIC_APPLY";
    input.reviewers[2].answers.demoBoundary = "LIVE_GPS_TURN_BY_TURN";
    const result = evaluateRiderReferenceComprehension(input);
    expect(result.status).toBe("NEEDS_REVISION");
    expect(result.criticalMisconceptionCount).toBe(1);
    expect(result.comprehensionPassed).toBe(false);
  });

  it("5명 미만, 중복 익명 ID와 직접 연락처를 거부한다", () => {
    expect(() => RiderReferenceComprehensionStudySchema.parse({
      ...study(),
      reviewers: study().reviewers.slice(0, 4),
    })).toThrow();

    const duplicate = study();
    duplicate.reviewers[1].reviewerId = duplicate.reviewers[0].reviewerId;
    expect(() => RiderReferenceComprehensionStudySchema.parse(duplicate)).toThrow(
      /unique/,
    );

    const withContact = study();
    withContact.reviewers[0].comment = "010-1234-5678로 연락";
    expect(() => RiderReferenceComprehensionStudySchema.parse(withContact)).toThrow(
      /email address or mobile phone number/,
    );
  });
});
