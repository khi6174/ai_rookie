export type RiderProfile = {
  courierId: string;
  displayName: string;
  areaCode: string;
  deliveryZone: string;
  completedCount: number;
  totalCount: number;
  shiftStart: string;
  expectedCompletion: string;
  safetyScore: number;
  projectedSafetyScore?: number;
  criticalMinute: number | null;
  criticalStopOrdinal: number | null;
  mapX: number;
  mapY: number;
  hubLabel: string;
  vehicleId: string;
};

export const riderProfiles: RiderProfile[];
export const defaultRiderProfile: RiderProfile;
export function findRiderProfile(courierId: string): RiderProfile | undefined;
