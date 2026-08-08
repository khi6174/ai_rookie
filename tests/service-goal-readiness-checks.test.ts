import { describe, expect, it } from "vitest";
import { evaluateDeployedServiceEvidence } from "../scripts/service-goal-readiness-checks.mjs";

function deployed(overrides: Record<string, unknown> = {}) {
  return {
    status: "LIVE_PASS",
    networkRequestPerformed: true,
    storage: "D1",
    restored: true,
    conflictProtected: true,
    upstageExplanationLive: true,
    publicReviewManifestVerified: true,
    deployedReleaseCommit: "4e5f7951c66b3e2b86c1d8f776eb0a0a06f5c288",
    reviewManifestSha256:
      "d1ca998adb5ca4b26f9fab521b1e70bf3e2f2cda9fa47ff090705f79e16c2bae",
    actualPersonalDataCount: 0,
    ...overrides,
  };
}

describe("서비스 Goal 공개 배포 Gate", () => {
  it("공개 smoke가 검증한 현재 배포를 과거 사람 검토 버전과 독립적으로 통과시킨다", () => {
    expect(evaluateDeployedServiceEvidence(deployed())).toBe(true);
  });

  it.each([
    ["D1 복구 실패", { restored: false }],
    ["충돌 보호 실패", { conflictProtected: false }],
    ["공개 manifest 검증 실패", { publicReviewManifestVerified: false }],
    ["실제 개인정보 포함", { actualPersonalDataCount: 1 }],
  ])("%s는 배포 Gate를 차단한다", (_label, overrides) => {
    expect(evaluateDeployedServiceEvidence(deployed(overrides))).toBe(false);
  });
});
