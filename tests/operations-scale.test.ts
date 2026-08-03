import { describe, expect, it } from "vitest";
import { createDailyOperationsSnapshot } from "../src/application/operations";
import { createScaledOperationsPackage } from "../src/evals/operationsScale";

describe("합성 운영 확장 fixture", () => {
  it("25명 이름 디렉터리 밖의 기사도 패키지 입력만으로 스냅샷을 만든다", async () => {
    const snapshot = await createDailyOperationsSnapshot(
      createScaledOperationsPackage(1),
      { createdAt: "2026-08-03T00:00:00.000Z" },
    );

    expect(snapshot.courierIds).toEqual(["scale-courier-001"]);
    expect(snapshot.fixture.couriers[0].courierId).toBe("scale-courier-001");
    expect(
      snapshot.fixture.initialSafetyStates?.[0].currentBudget,
    ).toBeGreaterThanOrEqual(31);
  });
});
