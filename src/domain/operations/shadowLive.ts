import { z } from "zod";

const pseudonymousId = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]+$/);

export const ShadowLiveProgressEventSchema = z
  .object({
    eventId: pseudonymousId,
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime({ offset: true }),
    eventType: z.enum([
      "SHIFT_STARTED",
      "STOP_PROGRESS",
      "PLAN_DELAYED",
      "SHIFT_ENDED",
    ]),
    courierRef: z.string().regex(/^anon-[a-z0-9][a-z0-9_-]{3,39}$/),
    planRef: z.string().regex(/^plan-[a-z0-9][a-z0-9_-]{3,39}$/),
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

const LiveShadowBatchSchema = z
  .object({
    schemaVersion: z.literal("shadow-live-progress-batch-v1"),
    dataMode: z.literal("LIVE_PILOT"),
    source: z
      .object({
        kind: z.literal("READ_ONLY_CONNECTOR"),
        connectionId: z
          .string()
          .regex(/^shadow-[a-z0-9][a-z0-9_-]{3,39}$/),
        generatedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    events: z.array(ShadowLiveProgressEventSchema).min(1).max(500),
  })
  .strict();

const SyntheticShadowBatchSchema = z
  .object({
    schemaVersion: z.literal("shadow-live-progress-batch-v1"),
    dataMode: z.literal("SYNTHETIC_STREAM"),
    source: z
      .object({
        kind: z.literal("DETERMINISTIC_DEMO_GENERATOR"),
        connectionId: z
          .string()
          .regex(/^shadow-demo-[a-z0-9][a-z0-9_-]{1,31}$/),
        generatedAt: z.string().datetime({ offset: true }),
        scenarioId: z
          .string()
          .regex(/^synthetic-[a-z0-9][a-z0-9_-]{3,47}$/),
        seed: z.number().int().nonnegative(),
      })
      .strict(),
    events: z.array(ShadowLiveProgressEventSchema).min(1).max(500),
  })
  .strict();

export const ShadowLiveBatchSchema = z
  .discriminatedUnion("dataMode", [
    LiveShadowBatchSchema,
    SyntheticShadowBatchSchema,
  ])
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

export type ShadowLiveBatch = z.infer<typeof ShadowLiveBatchSchema>;
export type ShadowLiveProgressEvent = z.infer<
  typeof ShadowLiveProgressEventSchema
>;

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

function collectForbiddenFields(
  value: unknown,
  path: Array<string | number> = [],
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenFields(item, [...path, index]),
    );
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const fieldPath = [...path, key];
    const normalized = key.toLowerCase().replaceAll(/[^a-z]/g, "");
    const current = forbiddenFieldNames.has(normalized)
      ? [fieldPath.join(".")]
      : [];
    return [...current, ...collectForbiddenFields(child, fieldPath)];
  });
}

export type ShadowLiveValidationResult =
  | {
      status: "ACCEPTED";
      batch: ShadowLiveBatch;
      summary: {
        dataMode: ShadowLiveBatch["dataMode"];
        eventCount: number;
        courierCount: number;
        latestOccurredAt: string;
        rawStored: false;
        serverTransmitted: false;
        safetyEngineUsed: false;
      };
    }
  | {
      status: "REJECTED";
      issues: Array<{ fieldPath: string; message: string }>;
    };

export function validateShadowLiveBatch(
  input: unknown,
): ShadowLiveValidationResult {
  const forbidden = collectForbiddenFields(input);
  if (forbidden.length > 0) {
    return {
      status: "REJECTED",
      issues: forbidden.map((fieldPath) => ({
        fieldPath,
        message: "개인정보·정밀 위치·생체정보 필드는 허용되지 않습니다.",
      })),
    };
  }

  const parsed = ShadowLiveBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "REJECTED",
      issues: parsed.error.issues.map((issue) => ({
        fieldPath: issue.path.join(".") || "batch",
        message: issue.message,
      })),
    };
  }

  const latestOccurredAt = [...parsed.data.events]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
    .occurredAt;
  return {
    status: "ACCEPTED",
    batch: parsed.data,
    summary: {
      dataMode: parsed.data.dataMode,
      eventCount: parsed.data.events.length,
      courierCount: new Set(
        parsed.data.events.map((event) => event.courierRef),
      ).size,
      latestOccurredAt,
      rawStored: false,
      serverTransmitted: false,
      safetyEngineUsed: false,
    },
  };
}

export function parseShadowLiveJson(text: string): ShadowLiveValidationResult {
  try {
    return validateShadowLiveBatch(JSON.parse(text) as unknown);
  } catch {
    return {
      status: "REJECTED",
      issues: [{ fieldPath: "batch", message: "유효한 JSON이 아닙니다." }],
    };
  }
}
