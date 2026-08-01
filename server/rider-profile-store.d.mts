import type { RiderProfile } from "./rider-profiles.mjs";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first(): Promise<Record<string, unknown> | null>;
  all(): Promise<{ results: Record<string, unknown>[] }>;
};

export type RiderProfileStoreOptions = {
  database?: {
    batch(statements: unknown[]): Promise<unknown>;
    prepare(sql: string): D1Statement;
  };
  memoryStore?: Map<string, RiderProfile>;
};

export function createMemoryRiderProfileStore(): Map<string, RiderProfile>;
export function handleRiderProfileRequest(
  request: Request,
  options?: RiderProfileStoreOptions,
): Promise<Response | undefined>;
