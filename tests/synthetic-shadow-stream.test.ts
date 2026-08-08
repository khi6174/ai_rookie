import { describe, expect, it } from "vitest";
import { validateShadowLiveBatch } from "../src/domain/operations/shadowLive";
import {
  createSyntheticShadowStreamFrame,
  recentSyntheticShadowStreamEvents,
  SYNTHETIC_SHADOW_STREAM_MAX_TICK,
} from "../src/domain/operations/syntheticShadowStream";

const startedAt = "2026-08-08T03:00:00.000Z";

describe("합성 실시간 배송 진행 generator", () => {
  it("같은 seed·시작시각·tick에서 같은 batch를 만든다", () => {
    const left = createSyntheticShadowStreamFrame({ tick: 7, startedAt });
    const right = createSyntheticShadowStreamFrame({ tick: 7, startedAt });
    expect(left).toEqual(right);
    expect(left.batch.dataMode).toBe("SYNTHETIC_STREAM");
    expect(left.batch.source.kind).toBe("DETERMINISTIC_DEMO_GENERATOR");
  });

  it("모든 frame이 strict 계약을 통과하고 sequence와 진행이 단조 증가한다", () => {
    let previousSequence = 0;
    let previousProgress = new Map<string, number>();
    for (let tick = 0; tick <= SYNTHETIC_SHADOW_STREAM_MAX_TICK; tick += 1) {
      const frame = createSyntheticShadowStreamFrame({ tick, startedAt });
      expect(validateShadowLiveBatch(frame.batch).status).toBe("ACCEPTED");
      for (const event of frame.batch.events) {
        expect(event.sequence).toBeGreaterThan(previousSequence);
        expect(event.completedStopCount).toBeGreaterThanOrEqual(
          previousProgress.get(event.courierRef) ?? 0,
        );
        expect(event.completedStopCount).toBeLessThanOrEqual(event.totalStopCount);
        previousSequence = event.sequence;
        previousProgress.set(event.courierRef, event.completedStopCount);
      }
    }
  });

  it("마지막 frame에서 여섯 가명 기사의 배송을 완료한다", () => {
    const frame = createSyntheticShadowStreamFrame({
      tick: SYNTHETIC_SHADOW_STREAM_MAX_TICK,
      startedAt,
    });
    expect(frame.finished).toBe(true);
    expect(frame.batch.events).toHaveLength(6);
    expect(
      frame.batch.events.every(
        (event) =>
          event.eventType === "SHIFT_ENDED" &&
          event.completedStopCount === event.totalStopCount,
      ),
    ).toBe(true);
  });

  it("최근 이벤트는 현재 tick부터 제한된 개수만 역순으로 제공한다", () => {
    const events = recentSyntheticShadowStreamEvents({
      tick: 5,
      startedAt,
      limit: 8,
    });
    expect(events).toHaveLength(8);
    expect(events[0].sequence).toBeGreaterThan(events[7].sequence);
  });
});
