import { z } from "zod";
import {
  defaultRiderProfile,
  findRiderProfile,
  riderProfiles,
  type RiderProfile,
} from "../../server/rider-profiles.mjs";

const riderProfileSchema = z.object({
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
}).refine((profile) => profile.completedCount <= profile.totalCount, {
  message: "완료 배송 수는 전체 배송 수를 넘을 수 없습니다.",
});

const riderResponseSchema = z.object({
  rider: riderProfileSchema,
  storage: z.enum(["D1", "MEMORY_DEV"]),
});

export type RiderProfileLoadResult = {
  profile: RiderProfile;
  source: "SERVER" | "BUNDLED";
};

export function resolveRequestedRiderProfile(search: string): RiderProfile {
  const courierId = new URLSearchParams(search).get("courier") ?? defaultRiderProfile.courierId;
  return findRiderProfile(courierId) ?? defaultRiderProfile;
}

export async function loadRiderProfile(
  courierId: string,
  signal?: AbortSignal,
): Promise<RiderProfileLoadResult> {
  const bundled = findRiderProfile(courierId) ?? defaultRiderProfile;
  try {
    const response = await fetch(`/api/riders/${encodeURIComponent(bundled.courierId)}`, { signal });
    if (!response.ok) throw new Error(`기사 데이터 응답 오류: ${response.status}`);
    const parsed = riderResponseSchema.parse(await response.json());
    return { profile: parsed.rider, source: "SERVER" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { profile: bundled, source: "BUNDLED" };
  }
}

export { riderProfiles };
export type { RiderProfile };
