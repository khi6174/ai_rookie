import { describe, expect, it } from "vitest";
import {
  parseShadowLiveJson,
  validateShadowLiveBatch,
} from "../src/domain/operations/shadowLive";

function validBatch() {
  return {
    schemaVersion: "shadow-live-progress-batch-v1",
    dataMode: "LIVE_PILOT",
    source: {
      kind: "READ_ONLY_CONNECTOR",
      connectionId: "shadow-pilot-01",
      generatedAt: "2026-08-07T12:00:10+09:00",
    },
    events: [
      {
        eventId: "event-0001",
        sequence: 1,
        occurredAt: "2026-08-07T12:00:00+09:00",
        eventType: "STOP_PROGRESS",
        courierRef: "anon-rider-001",
        planRef: "plan-route-001",
        completedStopCount: 6,
        totalStopCount: 14,
        coarseZone: "북부권역 A구역",
      },
      {
        eventId: "event-0002",
        sequence: 2,
        occurredAt: "2026-08-07T12:00:05+09:00",
        eventType: "PLAN_DELAYED",
        courierRef: "anon-rider-002",
        planRef: "plan-route-002",
        completedStopCount: 8,
        totalStopCount: 15,
      },
    ],
  };
}

describe("Shadow Live 읽기 전용 입력 계약", () => {
  it("가명 진행 이벤트만 허용하고 Safety·저장·전송 비사용을 명시한다", () => {
    const result = validateShadowLiveBatch(validBatch());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.summary).toMatchObject({
      eventCount: 2,
      courierCount: 2,
      rawStored: false,
      serverTransmitted: false,
      safetyEngineUsed: false,
    });
  });

  it("합성 스트림은 실제 연결과 다른 provenance로만 허용한다", () => {
    const live = validBatch();
    const result = validateShadowLiveBatch({
      ...live,
      dataMode: "SYNTHETIC_STREAM",
      source: {
        kind: "DETERMINISTIC_DEMO_GENERATOR",
        connectionId: "shadow-demo-01",
        generatedAt: "2026-08-08T12:00:00+09:00",
        scenarioId: "synthetic-delivery-progress-v1",
        seed: 617,
      },
    });
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.summary).toMatchObject({
      dataMode: "SYNTHETIC_STREAM",
      serverTransmitted: false,
      rawStored: false,
      safetyEngineUsed: false,
    });
  });

  it.each([
    ["name", "홍길동"],
    ["phone", "010-1234-5678"],
    ["address", "서울시 정확 주소"],
    ["latitude", 37.55],
    ["gps", { lat: 37.55, lng: 126.98 }],
    ["heartRate", 92],
  ])("금지 필드 %s를 원문 저장 전에 차단한다", (field, value) => {
    const batch = validBatch();
    Object.assign(batch.events[0], { [field]: value });
    const result = validateShadowLiveBatch(batch);
    expect(result.status).toBe("REJECTED");
    if (result.status !== "REJECTED") return;
    expect(result.issues.some((issue) => issue.fieldPath.includes(field))).toBe(
      true,
    );
  });

  it("가명 ID 형식, 단조 sequence와 배송 합계를 검증한다", () => {
    const batch = validBatch();
    batch.events[0].courierRef = "real-name";
    batch.events[1].sequence = 1;
    batch.events[1].completedStopCount = 20;
    const result = validateShadowLiveBatch(batch);
    expect(result.status).toBe("REJECTED");
    if (result.status !== "REJECTED") return;
    expect(result.issues.map((issue) => issue.fieldPath)).toEqual(
      expect.arrayContaining([
        "events.0.courierRef",
        "events.1.sequence",
        "events.1.completedStopCount",
      ]),
    );
  });

  it("손상된 JSON을 실행하지 않고 거부한다", () => {
    const result = parseShadowLiveJson('{"schemaVersion":');
    expect(result).toEqual({
      status: "REJECTED",
      issues: [{ fieldPath: "batch", message: "유효한 JSON이 아닙니다." }],
    });
  });
});
