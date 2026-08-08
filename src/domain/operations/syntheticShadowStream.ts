import type {
  ShadowLiveBatch,
  ShadowLiveProgressEvent,
} from "./shadowLive";

export const SYNTHETIC_SHADOW_STREAM_INTERVAL_MS = 2_000;
export const SYNTHETIC_SHADOW_STREAM_MAX_TICK = 24;
export const SYNTHETIC_SHADOW_STREAM_SEED = 617;

const profiles = [
  {
    courierRef: "anon-demo-001",
    planRef: "plan-demo-001",
    coarseZone: "북부권역 A구역",
    completedAtStart: 4,
    totalStopCount: 14,
    cadence: 2,
  },
  {
    courierRef: "anon-demo-002",
    planRef: "plan-demo-002",
    coarseZone: "북부권역 B구역",
    completedAtStart: 6,
    totalStopCount: 16,
    cadence: 2,
  },
  {
    courierRef: "anon-demo-003",
    planRef: "plan-demo-003",
    coarseZone: "남부권역 A구역",
    completedAtStart: 3,
    totalStopCount: 12,
    cadence: 2,
  },
  {
    courierRef: "anon-demo-004",
    planRef: "plan-demo-004",
    coarseZone: "남부권역 B구역",
    completedAtStart: 7,
    totalStopCount: 18,
    cadence: 2,
  },
  {
    courierRef: "anon-demo-005",
    planRef: "plan-demo-005",
    coarseZone: "서부권역 A구역",
    completedAtStart: 5,
    totalStopCount: 15,
    cadence: 2,
  },
  {
    courierRef: "anon-demo-006",
    planRef: "plan-demo-006",
    coarseZone: "서부권역 B구역",
    completedAtStart: 4,
    totalStopCount: 13,
    cadence: 2,
  },
] as const;

export type SyntheticShadowStreamFrame = {
  tick: number;
  elapsedSeconds: number;
  finished: boolean;
  batch: Extract<ShadowLiveBatch, { dataMode: "SYNTHETIC_STREAM" }>;
};

function eventType(
  tick: number,
  profileIndex: number,
  completedStopCount: number,
  totalStopCount: number,
): ShadowLiveProgressEvent["eventType"] {
  if (completedStopCount === totalStopCount) return "SHIFT_ENDED";
  if ((tick === 6 && profileIndex === 1) || (tick === 12 && profileIndex === 4)) {
    return "PLAN_DELAYED";
  }
  return tick === 0 ? "SHIFT_STARTED" : "STOP_PROGRESS";
}

export function createSyntheticShadowStreamFrame(input: {
  tick: number;
  startedAt: string;
  seed?: number;
}): SyntheticShadowStreamFrame {
  const startedAtMs = Date.parse(input.startedAt);
  if (!Number.isFinite(startedAtMs)) {
    throw new Error("Synthetic Shadow Stream requires a valid startedAt time");
  }
  const seed = input.seed ?? SYNTHETIC_SHADOW_STREAM_SEED;
  const tick = Math.min(
    SYNTHETIC_SHADOW_STREAM_MAX_TICK,
    Math.max(0, Math.trunc(input.tick)),
  );
  const generatedAt = new Date(
    startedAtMs + tick * SYNTHETIC_SHADOW_STREAM_INTERVAL_MS,
  ).toISOString();
  const events = profiles.map<ShadowLiveProgressEvent>((profile, index) => {
    const completedStopCount = Math.min(
      profile.totalStopCount,
      profile.completedAtStart + Math.floor((tick + (index % 2)) / profile.cadence),
    );
    const sequence = tick * profiles.length + index + 1;
    return {
      eventId: `demo-${seed}-${String(sequence).padStart(4, "0")}`,
      sequence,
      occurredAt: generatedAt,
      eventType: eventType(
        tick,
        index,
        completedStopCount,
        profile.totalStopCount,
      ),
      courierRef: profile.courierRef,
      planRef: profile.planRef,
      completedStopCount,
      totalStopCount: profile.totalStopCount,
      coarseZone: profile.coarseZone,
    };
  });

  return {
    tick,
    elapsedSeconds:
      (tick * SYNTHETIC_SHADOW_STREAM_INTERVAL_MS) / 1_000,
    finished: tick === SYNTHETIC_SHADOW_STREAM_MAX_TICK,
    batch: {
      schemaVersion: "shadow-live-progress-batch-v1",
      dataMode: "SYNTHETIC_STREAM",
      source: {
        kind: "DETERMINISTIC_DEMO_GENERATOR",
        connectionId: "shadow-demo-01",
        generatedAt,
        scenarioId: "synthetic-delivery-progress-v1",
        seed,
      },
      events,
    },
  };
}

export function recentSyntheticShadowStreamEvents(input: {
  tick: number;
  startedAt: string;
  seed?: number;
  limit?: number;
}): ShadowLiveProgressEvent[] {
  const currentTick = Math.min(
    SYNTHETIC_SHADOW_STREAM_MAX_TICK,
    Math.max(0, Math.trunc(input.tick)),
  );
  const firstTick = Math.max(0, currentTick - 2);
  const events: ShadowLiveProgressEvent[] = [];
  for (let tick = firstTick; tick <= currentTick; tick += 1) {
    events.push(
      ...createSyntheticShadowStreamFrame({
        tick,
        startedAt: input.startedAt,
        seed: input.seed,
      }).batch.events,
    );
  }
  return events.reverse().slice(0, input.limit ?? 8);
}

export function syntheticShadowStreamCourierCount(): number {
  return profiles.length;
}
