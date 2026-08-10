import { z } from "zod";

export const IntegrationSandboxModeSchema = z.literal("PRODUCTION_SANDBOX");

const sandboxId = (prefix: string, maximum = 64) =>
  z
    .string()
    .min(prefix.length + 4)
    .max(maximum)
    .regex(new RegExp(`^${prefix}[a-z0-9][a-z0-9_-]+$`));

export const SandboxTenantIdSchema = sandboxId("sandbox-tenant-");
export const SandboxSiteIdSchema = sandboxId("sandbox-site-");
export const SandboxActorIdSchema = sandboxId("sandbox-actor-");
export const SandboxCourierRefSchema = z
  .string()
  .regex(/^anon-[a-z0-9][a-z0-9_-]{3,39}$/);
export const SandboxPlanRefSchema = z
  .string()
  .regex(/^plan-[a-z0-9][a-z0-9_-]{3,39}$/);
export const SandboxRecipientRefSchema = sandboxId("sandbox-recipient-");

export const SandboxRoleSchema = z.enum([
  "PLATFORM_OPERATOR",
  "TENANT_ADMIN",
  "DISPATCHER",
  "COURIER",
]);

export const SandboxPrincipalSchema = z
  .object({
    schemaVersion: z.literal("integration-sandbox-principal-v1"),
    dataMode: IntegrationSandboxModeSchema,
    tenantId: SandboxTenantIdSchema,
    siteId: SandboxSiteIdSchema,
    actorId: SandboxActorIdSchema,
    role: SandboxRoleSchema,
  })
  .strict();

export const SandboxTmsEventSchema = z
  .object({
    eventId: sandboxId("sandbox-event-"),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime({ offset: true }),
    eventType: z.enum([
      "SHIFT_STARTED",
      "STOP_PROGRESS",
      "PLAN_DELAYED",
      "BREAK_STARTED",
      "BREAK_ENDED",
      "SHIFT_ENDED",
    ]),
    courierRef: SandboxCourierRefSchema,
    planRef: SandboxPlanRefSchema,
    planVersion: z.number().int().positive(),
    completedStopCount: z.number().int().nonnegative(),
    totalStopCount: z.number().int().positive().max(500),
    coarseZone: z.string().min(2).max(32).optional(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.completedStopCount > event.totalStopCount) {
      context.addIssue({
        code: "custom",
        path: ["completedStopCount"],
        message: "완료 배송 수는 전체 배송 수를 넘을 수 없습니다.",
      });
    }
  });

export const SandboxTmsEventBatchSchema = z
  .object({
    schemaVersion: z.literal("integration-sandbox-tms-batch-v1"),
    dataMode: IntegrationSandboxModeSchema,
    source: z
      .object({
        kind: z.literal("DETERMINISTIC_TMS_SIMULATOR"),
        tenantId: SandboxTenantIdSchema,
        siteId: SandboxSiteIdSchema,
        generatedAt: z.string().datetime({ offset: true }),
        scenarioId: sandboxId("sandbox-scenario-"),
        seed: z.number().int().nonnegative(),
      })
      .strict(),
    events: z.array(SandboxTmsEventSchema).min(1).max(500),
  })
  .strict()
  .superRefine((batch, context) => {
    const eventIds = new Set<string>();
    let previousSequence = -1;
    for (const [index, event] of batch.events.entries()) {
      if (eventIds.has(event.eventId)) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "eventId"],
          message: "eventId가 중복되었습니다.",
        });
      }
      eventIds.add(event.eventId);
      if (event.sequence <= previousSequence) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "sequence"],
          message: "sequence는 이전 이벤트보다 커야 합니다.",
        });
      }
      previousSequence = event.sequence;
    }
  });

const consentProofSchema = z
  .object({
    actorRef: z.union([SandboxCourierRefSchema, SandboxActorIdSchema]),
    response: z.literal("AGREED"),
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const SandboxPlanApplyCommandSchema = z
  .object({
    schemaVersion: z.literal("integration-sandbox-plan-command-v1"),
    dataMode: IntegrationSandboxModeSchema,
    destination: z.literal("SIMULATED_TMS_OUTBOX"),
    commandId: sandboxId("sandbox-command-"),
    idempotencyKey: sandboxId("sandbox-idempotency-"),
    tenantId: SandboxTenantIdSchema,
    siteId: SandboxSiteIdSchema,
    workspaceId: z.string().regex(/^operations-workspace-[a-f0-9-]{36}$/),
    decisionId: z.string().uuid(),
    courierRef: SandboxCourierRefSchema,
    planRef: SandboxPlanRefSchema,
    expectedPlanVersion: z.number().int().positive(),
    requestedAt: z.string().datetime({ offset: true }),
    approvedAt: z.string().datetime({ offset: true }),
    approvedBy: SandboxActorIdSchema,
    consentProofs: z.array(consentProofSchema).min(1).max(8),
    safetyProof: z
      .object({
        evaluationId: sandboxId("sandbox-evaluation-"),
        candidateId: z.string().min(8).max(80),
        candidateFeasibility: z.literal("FEASIBLE"),
        riskTransferGuard: z.literal("PASSED"),
        unsafeRecommendedCount: z.literal(0),
      })
      .strict(),
    change: z
      .object({
        nextPlanVersion: z.number().int().positive(),
        stopOrderRefs: z.array(sandboxId("sandbox-stop-")).min(1).max(500),
        etaUpdates: z
          .array(
            z
              .object({
                stopRef: sandboxId("sandbox-stop-"),
                eta: z.string().datetime({ offset: true }),
              })
              .strict(),
          )
          .min(1)
          .max(500),
      })
      .strict(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.change.nextPlanVersion !== command.expectedPlanVersion + 1) {
      context.addIssue({
        code: "custom",
        path: ["change", "nextPlanVersion"],
        message: "다음 계획 버전은 예상 버전보다 정확히 1 커야 합니다.",
      });
    }
    const stopOrder = new Set(command.change.stopOrderRefs);
    if (stopOrder.size !== command.change.stopOrderRefs.length) {
      context.addIssue({
        code: "custom",
        path: ["change", "stopOrderRefs"],
        message: "배송지 순서는 중복될 수 없습니다.",
      });
    }
    for (const [index, update] of command.change.etaUpdates.entries()) {
      if (!stopOrder.has(update.stopRef)) {
        context.addIssue({
          code: "custom",
          path: ["change", "etaUpdates", index, "stopRef"],
          message: "ETA 대상은 배송지 순서에 포함되어야 합니다.",
        });
      }
    }
  });

export const SandboxCustomerNoticeCommandSchema = z
  .object({
    schemaVersion: z.literal("integration-sandbox-customer-notice-v1"),
    dataMode: IntegrationSandboxModeSchema,
    destination: z.literal("SIMULATED_CUSTOMER_OUTBOX"),
    noticeId: sandboxId("sandbox-notice-"),
    idempotencyKey: sandboxId("sandbox-idempotency-"),
    tenantId: SandboxTenantIdSchema,
    siteId: SandboxSiteIdSchema,
    decisionId: z.string().uuid(),
    planRef: SandboxPlanRefSchema,
    appliedPlanVersion: z.number().int().positive(),
    recipientRef: SandboxRecipientRefSchema,
    templateId: z.enum(["SAFE_DELAY_APPLIED", "ETA_UPDATED", "PLAN_RESTORED"]),
    eta: z.string().datetime({ offset: true }),
    requestedAt: z.string().datetime({ offset: true }),
    networkDelivery: z.literal(false),
  })
  .strict();

const forbiddenFieldNames = new Set([
  "address",
  "biometric",
  "customer",
  "customername",
  "displayname",
  "email",
  "gps",
  "heartrate",
  "latitude",
  "lat",
  "longitude",
  "lng",
  "name",
  "phone",
  "preciselocation",
  "vehiclenumber",
]);

export function findSandboxForbiddenFields(
  value: unknown,
  path: Array<string | number> = [],
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findSandboxForbiddenFields(item, [...path, index]),
    );
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const fieldPath = [...path, key];
    const normalized = key.toLowerCase().replaceAll(/[^a-z]/g, "");
    return [
      ...(forbiddenFieldNames.has(normalized) ? [fieldPath.join(".")] : []),
      ...findSandboxForbiddenFields(child, fieldPath),
    ];
  });
}

export type SandboxPrincipal = z.infer<typeof SandboxPrincipalSchema>;
export type SandboxTmsEvent = z.infer<typeof SandboxTmsEventSchema>;
export type SandboxTmsEventBatch = z.infer<typeof SandboxTmsEventBatchSchema>;
export type SandboxPlanApplyCommand = z.infer<
  typeof SandboxPlanApplyCommandSchema
>;
export type SandboxCustomerNoticeCommand = z.infer<
  typeof SandboxCustomerNoticeCommandSchema
>;
