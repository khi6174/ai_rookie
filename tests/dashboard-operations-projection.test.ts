import { afterEach, describe, expect, it, vi } from "vitest";
import { bundledDailyOperationsPackage } from "../src/adapters/fixtures/syntheticOperationsPackage";
import {
  createDashboardOperationsProjection,
  loadDashboardOperationsProjection,
} from "../src/application/dashboardOperationsProjection";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("공개 관제 25명 DB projection", () => {
  it("정규화 운영 레코드와 결정론적 Safety 평가를 같은 기사 ID로 결합한다", async () => {
    const projection = await createDashboardOperationsProjection(
      bundledDailyOperationsPackage,
      {
        storage: "MEMORY_DEV",
        sourceBundleId:
          "daily-operations-documents-2026-07-25-bundled-v1",
      },
    );

    expect(projection.couriers).toHaveLength(25);
    expect(new Set(projection.couriers.map((courier) => courier.id)).size).toBe(
      25,
    );
    expect(projection.couriers[0]).toMatchObject({
      id: "demo-courier-001",
      name: "강태현",
      completed: 6,
      total: 14,
      remaining: 8,
      hubLabel: "합성 북부 허브",
    });
    expect(
      projection.couriers.every(
        (courier) =>
          courier.id.startsWith("demo-courier-") &&
          courier.name.length >= 2 &&
          courier.currentScore >= 0 &&
          courier.currentScore <= 100 &&
          courier.budget >= 0 &&
          courier.budget <= 100 &&
          courier.completed + courier.remaining === courier.total,
      ),
    ).toBe(true);
    expect(
      projection.couriers.filter((courier) => courier.decisionId),
    ).not.toHaveLength(0);
    const bands = projection.couriers.reduce(
      (counts, courier) => {
        const band =
          courier.budget < 30
            ? "BREACH"
            : courier.budget < 45
              ? "SUPPORT"
              : courier.budget < 60
                ? "CAUTION"
                : "STABLE";
        counts[band] += 1;
        return counts;
      },
      { BREACH: 0, SUPPORT: 0, CAUTION: 0, STABLE: 0 },
    );
    expect(bands.BREACH).toBeGreaterThan(0);
    expect(bands.SUPPORT).toBeGreaterThan(0);
    expect(bands.CAUTION).toBeGreaterThan(0);
    expect(bands.STABLE).toBeGreaterThan(0);
  });

  it("3개 허브 집계를 기사와 남은 배송 수에서 계산한다", async () => {
    const projection = await createDashboardOperationsProjection(
      bundledDailyOperationsPackage,
      {
        storage: "D1",
        sourceBundleId: "approved-bundle",
      },
    );

    expect(projection.hubs).toHaveLength(3);
    expect(
      projection.hubs.reduce((total, hub) => total + hub.courierCount, 0),
    ).toBe(25);
    expect(
      projection.hubs.reduce(
        (total, hub) => total + hub.remainingStopCount,
        0,
      ),
    ).toBe(
      bundledDailyOperationsPackage.records.reduce(
        (total, record) => total + record.plan.remainingStopCount,
        0,
      ),
    );
  });

  it("DB 조회 실패를 승인 번들 Fallback으로 명시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "offline" }), { status: 503 }),
      ),
    );

    const projection = await loadDashboardOperationsProjection();
    expect(projection.storage).toBe("BUNDLED_FALLBACK");
    expect(projection.couriers).toHaveLength(25);
  });
});
