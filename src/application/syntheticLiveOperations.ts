import type { DailyOperationsPackage } from "../domain/operations";

export const SYNTHETIC_LIVE_INTERVAL_MS = 1_000;
export const SYNTHETIC_LIVE_MINUTES_PER_TICK = 2;
export const SYNTHETIC_LIVE_SHIFT_TICKS = 119;
export const SYNTHETIC_LIVE_SAFETY_STRIDE_TICKS = 5;

export type SyntheticLiveActivity =
  | "DRIVING"
  | "DELIVERING"
  | "RESTING"
  | "DELAYED";

export type SyntheticLiveCourierState = {
  courierId: string;
  activity: SyntheticLiveActivity;
  activityLabel: string;
  routeProgress: number;
  completedStopCount: number;
  totalStopCount: number;
  currentStopOrdinal: number;
  simulatedAt: string;
  safetyInputUpdated: true;
};

export type SyntheticLiveOperationsFrame = {
  schemaVersion: "synthetic-live-operations-frame-v1";
  tick: number;
  simulatedMinutes: number;
  finished: false;
  operationsPackage: DailyOperationsPackage;
  courierStates: SyntheticLiveCourierState[];
};

function normalizeTick(tick: number) {
  return Math.max(0, Math.trunc(Number.isFinite(tick) ? tick : 0));
}

function shiftTick(tick: number) {
  return normalizeTick(tick) % (SYNTHETIC_LIVE_SHIFT_TICKS + 1);
}

function atOffset(value: string, minutes: number) {
  return new Date(Date.parse(value) + minutes * 60_000).toISOString();
}

function courierNumber(courierId: string) {
  return Number.parseInt(courierId.replace(/\D/g, ""), 10) || 0;
}

function courierIndex(courierId: string) {
  return Math.max(0, courierNumber(courierId) - 1);
}

function deliveryDelta(
  baseRemainingStopCount: number,
  courierIndex: number,
  tick: number,
) {
  const firstDeliveryTick = 4 + (courierIndex % 3);
  const cadence = 7 + (courierIndex % 4);
  if (tick < firstDeliveryTick) return 0;
  return Math.min(
    Math.max(0, baseRemainingStopCount - 1),
    1 + Math.floor((tick - firstDeliveryTick) / cadence),
  );
}

function activityAt(courierIndex: number, tick: number): SyntheticLiveActivity {
  const simulatedMinutes = tick * SYNTHETIC_LIVE_MINUTES_PER_TICK;
  const restStart = 28 + (courierIndex % 3) * 4;
  if (
    courierIndex % 6 === 0 &&
    simulatedMinutes >= restStart &&
    simulatedMinutes < restStart + 14
  ) {
    return "RESTING";
  }
  if (
    courierIndex % 7 === 2 &&
    simulatedMinutes >= 18 &&
    simulatedMinutes < 30
  ) {
    return "DELAYED";
  }
  const phase = (tick + courierIndex * 2) % 9;
  return phase === 0 || phase === 1 ? "DELIVERING" : "DRIVING";
}

export function syntheticLiveCourierActivity(
  courierId: string,
  requestedTick: number,
) {
  return activityAt(courierIndex(courierId), shiftTick(requestedTick));
}

export function syntheticLiveActivityLabel(activity: SyntheticLiveActivity) {
  return {
    DRIVING: "다음 배송지로 이동",
    DELIVERING: "배송지 정차·전달",
    RESTING: "안전 휴식 중",
    DELAYED: "도로 지연 확인",
  }[activity];
}

function drivingTickCount(courierIndex: number, tick: number) {
  let total = 0;
  for (let current = 0; current <= tick; current += 1) {
    if (activityAt(courierIndex, current) === "DRIVING") total += 1;
  }
  return total;
}

function routeProgress(courierIndex: number, tick: number) {
  const distance = drivingTickCount(courierIndex, tick) * 0.045;
  const phase = (courierIndex * 0.071 + distance) % 2;
  return phase <= 1 ? phase : 2 - phase;
}

export function syntheticLiveCourierRouteProgress(
  courierId: string,
  requestedTick: number,
) {
  return routeProgress(courierIndex(courierId), shiftTick(requestedTick));
}

function continuousWorkMinutes(input: {
  baseMinutes: number;
  courierIndex: number;
  simulatedMinutes: number;
}) {
  const restStart = 28 + (input.courierIndex % 3) * 4;
  const restDuration = 14;
  if (input.courierIndex % 6 !== 0 || input.simulatedMinutes < restStart) {
    return input.baseMinutes + input.simulatedMinutes;
  }
  if (input.simulatedMinutes < restStart + restDuration) {
    return input.baseMinutes + restStart;
  }
  return input.simulatedMinutes - restStart - restDuration;
}

export function createSyntheticLiveOperationsFrame(
  basePackage: DailyOperationsPackage,
  requestedTick: number,
): SyntheticLiveOperationsFrame {
  const tick = normalizeTick(requestedTick);
  const currentShiftTick = shiftTick(tick);
  const simulatedMinutes =
    currentShiftTick * SYNTHETIC_LIVE_MINUTES_PER_TICK;
  const evaluatedAt = atOffset(basePackage.evaluatedAt, simulatedMinutes);
  const courierStates: SyntheticLiveCourierState[] = [];
  const operationsPackage = structuredClone(basePackage);
  operationsPackage.evaluatedAt = evaluatedAt;
  operationsPackage.records = operationsPackage.records.map((record, index) => {
    const baseRecord = basePackage.records[index];
    const completedDelta = deliveryDelta(
      baseRecord.plan.remainingStopCount,
      index,
      currentShiftTick,
    );
    const remainingStops = baseRecord.plan.stops
      .slice(completedDelta)
      .map((stop, stopIndex) => ({
        ...stop,
        sequence: stopIndex + 1,
        eta: atOffset(stop.eta, simulatedMinutes),
      }));
    const activity = activityAt(index, currentShiftTick);
    const restStart = 28 + (index % 3) * 4;
    const elapsedRestMinutes =
      index % 6 === 0 && simulatedMinutes >= restStart
        ? Math.min(14, simulatedMinutes - restStart)
        : 0;
    const completedStopCount =
      baseRecord.plan.completedStopCount + completedDelta;

    courierStates.push({
      courierId: record.courier.courierId,
      activity,
      activityLabel: syntheticLiveActivityLabel(activity),
      routeProgress: routeProgress(index, currentShiftTick),
      completedStopCount,
      totalStopCount: baseRecord.plan.totalStopCount,
      currentStopOrdinal: Math.min(
        baseRecord.plan.totalStopCount,
        completedStopCount + 1,
      ),
      simulatedAt: evaluatedAt,
      safetyInputUpdated: true,
    });

    return {
      ...record,
      shift: {
        ...record.shift,
        evaluatedAt: atOffset(baseRecord.shift.evaluatedAt, simulatedMinutes),
        continuousWorkMinutes: continuousWorkMinutes({
          baseMinutes: baseRecord.shift.continuousWorkMinutes,
          courierIndex: index,
          simulatedMinutes,
        }),
        plannedBreakMinutes:
          baseRecord.shift.plannedBreakMinutes + elapsedRestMinutes,
      },
      plan: {
        ...record.plan,
        planVersion: `${baseRecord.plan.planVersion}-sim-${tick}`.slice(0, 100),
        completedStopCount,
        remainingStopCount: remainingStops.length,
        remainingWeightKg: Number(
          remainingStops
            .reduce((total, stop) => total + stop.weightKg, 0)
            .toFixed(3),
        ),
        stops: remainingStops,
      },
    };
  });

  return {
    schemaVersion: "synthetic-live-operations-frame-v1",
    tick,
    simulatedMinutes,
    finished: false,
    operationsPackage,
    courierStates,
  };
}
