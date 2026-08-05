export type RiderDangerSignalStoreOptions = {
  database?: {
    batch(statements: unknown[]): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): {
        all(): Promise<{ results?: Array<Record<string, string>> }>;
        run(): Promise<unknown>;
      };
    };
  };
  memoryStore?: Map<string, unknown>;
  now?: () => Date;
};

export function createMemoryRiderDangerSignalStore(): Map<string, unknown>;

export function handleRiderDangerSignalRequest(
  request: Request,
  options?: RiderDangerSignalStoreOptions,
): Promise<Response | undefined>;
