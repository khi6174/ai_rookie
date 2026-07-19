import { describe, expect, it } from "vitest";
import {
  APPROVED_DEMO_PLAN_CACHE_KEY,
  APPROVED_DEMO_PLAN_CACHE_TTL_MS,
  clearCachedApprovedDemoPlan,
  createCachedApprovedDemoPlan,
  evaluateCachedApprovedDemoPlan,
  readCachedApprovedDemoPlan,
  writeCachedApprovedDemoPlan,
} from "../src/pwa/approvedPlanCache";

const storedAt = new Date("2026-07-19T03:00:00.000Z");

function createPlan() {
  return createCachedApprovedDemoPlan({
    decisionId: "decision-demo-cache-v1",
    planId: "plan-demo-v1",
    planVersion: "1.0.1",
    couriers: [{ courierId: "courier-demo-017", remainingStopCount: 9 }],
    storedAt,
  });
}

describe("마지막 승인 Demo 계획 캐시", () => {
  it("승인·적용된 최소 필드만 버전과 TTL로 만든다", () => {
    const plan = createPlan();
    expect(plan.dataMode).toBe("DEMO");
    expect(plan.approvalState).toBe("APPROVED_APPLIED");
    expect(Date.parse(plan.expiresAt) - Date.parse(plan.storedAt)).toBe(APPROVED_DEMO_PLAN_CACHE_TTL_MS);
    expect(JSON.stringify(plan)).not.toMatch(/name|phone|address|latitude|longitude|biometric/i);
  });

  it("만료 전에는 읽기 가능하고 정확히 만료시각부터 최신 계획으로 사용하지 않는다", () => {
    const plan = createPlan();
    expect(evaluateCachedApprovedDemoPlan(plan, new Date(Date.parse(plan.expiresAt) - 1))).toMatchObject({ status: "FRESH" });
    expect(evaluateCachedApprovedDemoPlan(plan, new Date(plan.expiresAt))).toMatchObject({ status: "EXPIRED" });
  });

  it("잘못된 JSON과 알 수 없는 필드를 INVALID로 격리한다", () => {
    expect(evaluateCachedApprovedDemoPlan("{broken")).toEqual({ status: "INVALID", reason: "MALFORMED_JSON" });
    expect(evaluateCachedApprovedDemoPlan({ ...createPlan(), customerAddress: "금지" })).toEqual({ status: "INVALID", reason: "SCHEMA_INVALID" });
  });

  it("저장소 실패를 throw하지 않고 명시적 상태로 반환한다", () => {
    const unavailable = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    };
    expect(writeCachedApprovedDemoPlan(createPlan(), unavailable)).toBe(false);
    expect(readCachedApprovedDemoPlan(unavailable)).toEqual({ status: "INVALID", reason: "STORAGE_UNAVAILABLE" });
    expect(clearCachedApprovedDemoPlan(unavailable)).toBe(false);
  });

  it("같은 키에서 저장·읽기·삭제를 재현한다", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const plan = createPlan();
    expect(writeCachedApprovedDemoPlan(plan, storage)).toBe(true);
    expect(values.has(APPROVED_DEMO_PLAN_CACHE_KEY)).toBe(true);
    expect(readCachedApprovedDemoPlan(storage, storedAt)).toMatchObject({ status: "FRESH", plan });
    expect(clearCachedApprovedDemoPlan(storage)).toBe(true);
    expect(readCachedApprovedDemoPlan(storage)).toEqual({ status: "EMPTY" });
  });
});
