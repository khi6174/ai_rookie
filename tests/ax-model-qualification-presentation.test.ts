// @ts-nocheck -- Node evidence projection contract.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { axModelQualification } from "../src/ui/axModelQualification";

describe("A.X v2 qualification presentation", () => {
  it("matches the independently verified aggregate evidence", async () => {
    const [trainingEvidence, productReview] = await Promise.all([
      readFile(
        "artifacts/evals/ax-cascade-lora-v2-evidence-latest.json",
        "utf8",
      ).then(JSON.parse),
      readFile(
        "artifacts/evals/ax-cascade-product-review-v2-latest.json",
        "utf8",
      ).then(JSON.parse),
    ]);
    const local = productReview.metrics.find(
      (item: { strategy: string }) => item.strategy === "LOCAL_ONLY",
    );
    const hosted = productReview.metrics.find(
      (item: { strategy: string }) => item.strategy === "HOSTED_ONLY",
    );

    expect(axModelQualification.evidence).toMatchObject({
      trainingRecords: trainingEvidence.training.trainRecords,
      validationPassed: trainingEvidence.validation.metrics.verified,
      validationTotal: trainingEvidence.validation.taskCount,
      frozenPassed: trainingEvidence.frozen.metrics.verified,
      frozenTotal: trainingEvidence.frozen.taskCount,
      productReviewPassed: local.verifiedLocal,
      productReviewTotal: local.taskCount,
      fallbackCount: local.fallback,
      unsafeDisplayCount: local.unsafeDisplayCount,
      localP95Label: `${(local.latencyMsP95 / 1_000).toFixed(2)}초`,
      hostedP95Label: `${(hosted.latencyMsP95 / 1_000).toFixed(2)}초`,
    });
    expect(productReview.productIntegrationApproved).toBe(false);
    expect(productReview.humanReview.runtimeActivationReady).toBe(false);
    expect(axModelQualification.publicRuntimeLabel).toBe(
      "Upstage Hosted + 안전 템플릿",
    );
  });

  it("states the runtime and AI authority boundaries in every review", () => {
    const text = JSON.stringify(axModelQualification);
    expect(text).toContain("제품 미활성");
    expect(text).toContain("현장 성과 주장이 아닙니다");
    expect(text).toContain("추천·실행 가능성·승인 상태를 변경하지 않습니다");
    expect(text).not.toContain("productIntegrationApproved=true");
  });
});
