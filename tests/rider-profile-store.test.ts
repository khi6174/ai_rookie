import { describe, expect, it } from "vitest";
import {
  createMemoryRiderProfileStore,
  handleRiderProfileRequest,
} from "../server/rider-profile-store.mjs";

describe("기사별 저장 데이터", () => {
  it("20명의 이름·구역·배송 진행을 기사 ID별로 반환한다", async () => {
    const store = createMemoryRiderProfileStore();
    const listResponse = await handleRiderProfileRequest(
      new Request("http://localhost/api/riders"),
      { memoryStore: store },
    );
    expect(listResponse?.status).toBe(200);
    const list = await listResponse?.json() as { riders: Array<{ courierId: string; displayName: string }> };
    expect(list.riders).toHaveLength(20);
    expect(new Set(list.riders.map((rider) => rider.courierId)).size).toBe(20);
    expect(new Set(list.riders.map((rider) => rider.displayName)).size).toBe(20);

    const riderResponse = await handleRiderProfileRequest(
      new Request("http://localhost/api/riders/R-017"),
      { memoryStore: store },
    );
    const body = await riderResponse?.json() as {
      rider: {
        displayName: string;
        areaCode: string;
        deliveryZone: string;
        completedCount: number;
        totalCount: number;
        safetyScore: number;
        criticalMinute: number;
      };
    };
    expect(body.rider).toMatchObject({
      displayName: "강태현",
      areaCode: "역삼 A",
      deliveryZone: "서울시 강남구 역삼동 한빛아파트",
      completedCount: 14,
      totalCount: 31,
      safetyScore: 54.7,
      criticalMinute: 52,
    });
  });

  it("없는 기사와 잘못된 기사 ID를 구분한다", async () => {
    const store = createMemoryRiderProfileStore();
    const missing = await handleRiderProfileRequest(
      new Request("http://localhost/api/riders/R-999"),
      { memoryStore: store },
    );
    const invalid = await handleRiderProfileRequest(
      new Request("http://localhost/api/riders/not-a-rider"),
      { memoryStore: store },
    );
    expect(missing?.status).toBe(404);
    expect(invalid?.status).toBe(400);
  });
});
