export type SyntheticOperationsStoreOptions = {
  bundle?: unknown;
  database?: {
    batch(statements: unknown[]): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): {
        first(): Promise<Record<string, unknown> | null>;
        all(): Promise<{ results: Record<string, unknown>[] }>;
        run(): Promise<unknown>;
      };
    };
  };
  memoryStore?: ReturnType<typeof createMemorySyntheticOperationsStore>;
};

export function createMemorySyntheticOperationsStore(bundle: unknown): {
  seed: {
    sourceBundleId: string;
    operationsPackage: Record<string, unknown>;
  };
  projection: Record<string, unknown>;
};

export function handleSyntheticOperationsRequest(
  request: Request,
  options?: SyntheticOperationsStoreOptions,
): Promise<Response | undefined>;
