export type ShadowLiveMemoryStore = {
  events: Map<string, Record<string, unknown>>;
};

export type ShadowLiveStoreOptions = {
  database?: {
    batch(statements: unknown[]): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): {
        first(): Promise<Record<string, unknown> | null>;
        run(): Promise<unknown>;
      };
    };
  };
  memoryStore?: ShadowLiveMemoryStore;
  enabled?: boolean;
  ingestToken?: string;
  connectionId?: string;
  retentionHours?: string | number;
  now?: () => Date;
};

export function createMemoryShadowLiveStore(): ShadowLiveMemoryStore;

export function handleShadowLiveRequest(
  request: Request,
  options?: ShadowLiveStoreOptions,
): Promise<Response | undefined>;
