export type SyntheticCourierDirectoryEntry = {
  courierId: string;
  displayName: string;
  initialSafetyBudget: number;
  displayOrder: number;
  dataMode: "SYNTHETIC";
  syntheticAlias: true;
};

export const syntheticCourierDirectoryVersion: string;
export const syntheticCourierDirectory: SyntheticCourierDirectoryEntry[];
export function findSyntheticCourierDirectoryEntry(
  courierId: string,
): SyntheticCourierDirectoryEntry | undefined;
export function initialSafetyBudgetForCourier(courierId: string): number;
export function applySyntheticCourierDirectory<T extends {
  courier: { courierId: string; displayLabel: string };
}>(records: T[]): T[];
