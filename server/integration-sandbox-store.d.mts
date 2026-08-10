export interface IntegrationSandboxMemoryStore {
  events: Map<string, Record<string, unknown>>;
  planOutbox: Map<string, Record<string, unknown>>;
  noticeOutbox: Map<string, Record<string, unknown>>;
  planVersions: Map<string, number>;
  audits: Array<Record<string, unknown>>;
  rateWindows: Map<string, number>;
  killSwitches: {
    planApplyDisabled: boolean;
    customerNoticeDisabled: boolean;
    aiExplanationDisabled: boolean;
  };
  databaseRevision: number;
  databaseRowExists: boolean;
}

export function createMemoryIntegrationSandboxStore(): IntegrationSandboxMemoryStore;
export function handleIntegrationSandboxRequest(
  request: Request,
  options?: {
    memoryStore?: IntegrationSandboxMemoryStore;
    database?: {
      prepare(query: string): unknown;
      batch(statements: unknown[]): Promise<unknown>;
    };
    rateStore?: Map<string, number>;
    enabled?: boolean;
    serviceToken?: string;
    tenantId?: string;
    siteId?: string;
    retentionHours?: string | number;
    rateLimitPerMinute?: string | number;
    faultMode?: "NONE" | "FAIL_PLAN" | "FAIL_NOTICE";
    aiConfigured?: boolean;
    now?: () => Date;
  },
): Promise<Response | undefined>;
