export type OperationsSessionStoreOptions = {
  database?: {
    batch(statements: unknown[]): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): {
        first(): Promise<Record<string, string> | null>;
        run(): Promise<unknown>;
      };
    };
  };
  memoryStore?: Map<string, unknown>;
};

export function createMemoryOperationsSessionStore(): Map<string, unknown>;

export function handleOperationsSessionRequest(
  request: Request,
  options?: OperationsSessionStoreOptions,
): Promise<Response | undefined>;
