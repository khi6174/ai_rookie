import { z } from "zod";
import {
  defaultRiderProfile as legacyDefaultRiderProfile,
  findRiderProfile as findLegacyRiderProfile,
  riderProfiles as legacyProfiles,
  type RiderProfile,
} from "../../server/rider-profiles.mjs";
import { initialSafetyBudgetForCourier } from "../../server/synthetic-courier-directory.mjs";
import { bundledDailyOperationsPackage } from "../adapters/fixtures/syntheticOperationsPackage";
import {
  loadDashboardOperationsProjection,
  type DashboardCourierProjection,
  type DashboardOperationsStorage,
} from "./dashboardOperationsProjection";

const legacyRiderProfileSchema = z
  .object({
    courierId: z.string().regex(/^R-\d{3}$/),
    displayName: z.string().min(2),
    areaCode: z.string().min(2),
    deliveryZone: z.string().min(5),
    completedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().positive(),
    shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
    expectedCompletion: z.string().min(4),
    safetyScore: z.number().min(0).max(100),
    projectedSafetyScore: z.number().min(0).max(100).optional(),
    criticalMinute: z.number().int().nonnegative().nullable(),
    criticalStopOrdinal: z.number().int().positive().nullable(),
    mapX: z.number(),
    mapY: z.number(),
    hubLabel: z.string().min(2),
    vehicleId: z.string().min(2),
  })
  .refine((profile) => profile.completedCount <= profile.totalCount, {
    message: "완료 배송 수는 전체 배송 수를 넘을 수 없습니다.",
  });

const legacyRiderResponseSchema = z.object({
  rider: legacyRiderProfileSchema,
  storage: z.enum(["D1", "MEMORY_DEV"]),
});

export type RiderProfileLoadResult = {
  profile: RiderProfile;
  source:
    | "OPERATIONS_D1"
    | "OPERATIONS_MEMORY_DEV"
    | "OPERATIONS_BUNDLED_FALLBACK"
    | "LEGACY_SERVER"
    | "LEGACY_BUNDLED";
};

export type RiderProfilesLoadResult = {
  profiles: RiderProfile[];
  source: RiderProfileLoadResult["source"];
};

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function sourceForStorage(
  storage: DashboardOperationsStorage,
): RiderProfileLoadResult["source"] {
  return storage === "D1"
    ? "OPERATIONS_D1"
    : storage === "MEMORY_DEV"
      ? "OPERATIONS_MEMORY_DEV"
      : "OPERATIONS_BUNDLED_FALLBACK";
}

function profileFromCourier(
  courier: DashboardCourierProjection,
): RiderProfile {
  const record = bundledDailyOperationsPackage.records.find(
    (item) => item.courier.courierId === courier.id,
  );
  if (!record) {
    throw new Error(`기사 앱 원천 레코드가 없습니다: ${courier.id}`);
  }
  return {
    courierId: courier.id,
    displayName: courier.name,
    areaCode: courier.area,
    deliveryZone: courier.area,
    completedCount: courier.completed,
    totalCount: courier.total,
    shiftStart: courier.shift,
    expectedCompletion: timeLabel(record.plan.stops.at(-1)?.eta ?? record.shift.endAt),
    safetyScore: courier.currentScore,
    projectedSafetyScore: courier.budget,
    criticalMinute: courier.criticalMinute,
    criticalStopOrdinal: courier.criticalStopOrdinal,
    mapX: courier.mapX,
    mapY: courier.mapY,
    hubLabel: courier.hubLabel,
    vehicleId: courier.vehicleId,
  };
}

function preliminaryProfile(index: number): RiderProfile {
  const record = bundledDailyOperationsPackage.records[index];
  const column = index % 5;
  const row = Math.floor(index / 5);
  return {
    courierId: record.courier.courierId,
    displayName: record.courier.displayLabel,
    areaCode: record.plan.stops[0].coarseZone,
    deliveryZone: record.plan.stops[0].coarseZone,
    completedCount: record.plan.completedStopCount,
    totalCount: record.plan.totalStopCount,
    shiftStart: timeLabel(record.shift.startAt).replace(/^(오전|오후)\s*/, ""),
    expectedCompletion: timeLabel(
      record.plan.stops.at(-1)?.eta ?? record.shift.endAt,
    ),
    safetyScore: initialSafetyBudgetForCourier(record.courier.courierId),
    criticalMinute: null,
    criticalStopOrdinal: null,
    mapX: 24 + column * 13,
    mapY: 25 + row * 12,
    hubLabel: record.hub.label,
    vehicleId: record.vehicle.vehicleId,
  };
}

export const riderProfiles: RiderProfile[] =
  bundledDailyOperationsPackage.records.map((_, index) =>
    preliminaryProfile(index),
  );
export const legacyRiderProfiles: RiderProfile[] = legacyProfiles;
export const defaultRiderProfile = riderProfiles[0];

export function resolveRequestedRiderProfile(search: string): RiderProfile {
  const courierId =
    new URLSearchParams(search).get("courier") ?? defaultRiderProfile.courierId;
  return (
    riderProfiles.find((profile) => profile.courierId === courierId) ??
    findLegacyRiderProfile(courierId) ??
    defaultRiderProfile
  );
}

export async function loadRiderProfiles(
  signal?: AbortSignal,
): Promise<RiderProfilesLoadResult> {
  const projection = await loadDashboardOperationsProjection(signal);
  return {
    profiles: projection.couriers.map(profileFromCourier),
    source: sourceForStorage(projection.storage),
  };
}

export async function loadRiderProfile(
  courierId: string,
  signal?: AbortSignal,
): Promise<RiderProfileLoadResult> {
  if (courierId.startsWith("demo-courier-")) {
    const result = await loadRiderProfiles(signal);
    return {
      profile:
        result.profiles.find((profile) => profile.courierId === courierId) ??
        result.profiles[0],
      source: result.source,
    };
  }

  const bundled = findLegacyRiderProfile(courierId) ?? legacyDefaultRiderProfile;
  try {
    const response = await fetch(
      `/api/riders/${encodeURIComponent(bundled.courierId)}`,
      { signal },
    );
    if (!response.ok) {
      throw new Error(`기사 데이터 응답 오류: ${response.status}`);
    }
    const parsed = legacyRiderResponseSchema.parse(await response.json());
    return { profile: parsed.rider, source: "LEGACY_SERVER" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return { profile: bundled, source: "LEGACY_BUNDLED" };
  }
}

export type { RiderProfile };
