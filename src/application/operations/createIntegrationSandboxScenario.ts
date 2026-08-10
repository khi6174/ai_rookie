import {
  SandboxCustomerNoticeCommandSchema,
  SandboxPlanApplyCommandSchema,
  SandboxTmsEventBatchSchema,
  type SandboxCustomerNoticeCommand,
  type SandboxPlanApplyCommand,
  type SandboxTmsEventBatch,
} from "../../domain/operations/integrationSandbox";

export type IntegrationSandboxScenarioKind =
  | "NORMAL"
  | "DELAYED"
  | "DUPLICATE_RETRY"
  | "OUT_OF_ORDER";

export interface IntegrationSandboxScenarioInput {
  tenantId: string;
  siteId: string;
  scenarioId: string;
  seed: number;
  startedAt: string;
  courierCount: number;
  tick: number;
  kind: IntegrationSandboxScenarioKind;
}

function pad(value: number) {
  return String(value).padStart(3, "0");
}

function atOffset(startedAt: string, minutes: number) {
  return new Date(Date.parse(startedAt) + minutes * 60_000).toISOString();
}

export function createIntegrationSandboxTmsBatch(
  input: IntegrationSandboxScenarioInput,
): SandboxTmsEventBatch {
  if (!Number.isInteger(input.courierCount) || input.courierCount < 1 || input.courierCount > 240) {
    throw new Error("courierCount는 1~240 정수여야 합니다.");
  }
  if (!Number.isInteger(input.tick) || input.tick < 0) {
    throw new Error("tick은 0 이상의 정수여야 합니다.");
  }
  const baseSequence = input.tick * input.courierCount;
  const events = Array.from({ length: input.courierCount }, (_, index) => {
    const courierNumber = index + 1;
    const totalStopCount = 12 + ((input.seed + courierNumber) % 9);
    const completedStopCount = Math.min(
      totalStopCount,
      Math.floor(input.tick / 2) + ((input.seed + courierNumber) % 3),
    );
    const sequence = baseSequence + courierNumber;
    return {
      eventId: `sandbox-event-${pad(input.tick)}-${pad(courierNumber)}`,
      sequence,
      occurredAt: atOffset(input.startedAt, input.tick * 2 + index),
      eventType:
        input.kind === "DELAYED" && index === 0
          ? ("PLAN_DELAYED" as const)
          : ("STOP_PROGRESS" as const),
      courierRef: `anon-sandbox-${pad(courierNumber)}`,
      planRef: `plan-sandbox-${pad(courierNumber)}`,
      planVersion: 1 + Math.floor(input.tick / 10),
      completedStopCount,
      totalStopCount,
      coarseZone: `합성 ${((courierNumber - 1) % 3) + 1}권역`,
    };
  });
  if (input.kind === "DUPLICATE_RETRY") {
    events.push({ ...events[0] });
  }
  if (input.kind === "OUT_OF_ORDER" && events.length > 1) {
    [events[0], events[1]] = [events[1], events[0]];
  }
  return SandboxTmsEventBatchSchema.parse({
    schemaVersion: "integration-sandbox-tms-batch-v1",
    dataMode: "PRODUCTION_SANDBOX",
    source: {
      kind: "DETERMINISTIC_TMS_SIMULATOR",
      tenantId: input.tenantId,
      siteId: input.siteId,
      generatedAt: atOffset(input.startedAt, input.tick * 2),
      scenarioId: input.scenarioId,
      seed: input.seed,
    },
    events,
  });
}

export function createIntegrationSandboxPlanCommand(
  overrides: Partial<SandboxPlanApplyCommand> = {},
): SandboxPlanApplyCommand {
  return SandboxPlanApplyCommandSchema.parse({
    schemaVersion: "integration-sandbox-plan-command-v1",
    dataMode: "PRODUCTION_SANDBOX",
    destination: "SIMULATED_TMS_OUTBOX",
    commandId: "sandbox-command-0001",
    idempotencyKey: "sandbox-idempotency-plan-0001",
    tenantId: "sandbox-tenant-alpha",
    siteId: "sandbox-site-seoul",
    workspaceId: "operations-workspace-00000000-0000-4000-8000-000000000617",
    decisionId: "00000000-0000-4000-8000-000000000701",
    courierRef: "anon-sandbox-001",
    planRef: "plan-sandbox-001",
    expectedPlanVersion: 1,
    requestedAt: "2026-08-10T12:00:00+09:00",
    approvedAt: "2026-08-10T12:01:00+09:00",
    approvedBy: "sandbox-actor-admin-001",
    consentProofs: [
      {
        actorRef: "anon-sandbox-001",
        response: "AGREED",
        recordedAt: "2026-08-10T12:00:30+09:00",
      },
    ],
    safetyProof: {
      evaluationId: "sandbox-evaluation-0001",
      candidateId: "candidate-safe-delay-001",
      candidateFeasibility: "FEASIBLE",
      riskTransferGuard: "PASSED",
      unsafeRecommendedCount: 0,
    },
    change: {
      nextPlanVersion: 2,
      stopOrderRefs: ["sandbox-stop-0001", "sandbox-stop-0002"],
      etaUpdates: [
        { stopRef: "sandbox-stop-0001", eta: "2026-08-10T12:20:00+09:00" },
        { stopRef: "sandbox-stop-0002", eta: "2026-08-10T12:35:00+09:00" },
      ],
    },
    ...overrides,
  });
}

export function createIntegrationSandboxCustomerNotice(
  overrides: Partial<SandboxCustomerNoticeCommand> = {},
): SandboxCustomerNoticeCommand {
  return SandboxCustomerNoticeCommandSchema.parse({
    schemaVersion: "integration-sandbox-customer-notice-v1",
    dataMode: "PRODUCTION_SANDBOX",
    destination: "SIMULATED_CUSTOMER_OUTBOX",
    noticeId: "sandbox-notice-0001",
    idempotencyKey: "sandbox-idempotency-notice-0001",
    tenantId: "sandbox-tenant-alpha",
    siteId: "sandbox-site-seoul",
    decisionId: "00000000-0000-4000-8000-000000000701",
    planRef: "plan-sandbox-001",
    appliedPlanVersion: 2,
    recipientRef: "sandbox-recipient-0001",
    templateId: "SAFE_DELAY_APPLIED",
    eta: "2026-08-10T12:20:00+09:00",
    requestedAt: "2026-08-10T12:02:00+09:00",
    networkDelivery: false,
    ...overrides,
  });
}
