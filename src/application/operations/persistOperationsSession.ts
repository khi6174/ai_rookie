import { z } from "zod";
import {
  DecisionRecordSchema,
  InterventionCandidateSchema,
  InterventionEvaluationSchema,
  ScenarioFixtureSchema,
} from "../../domain/contracts";
import {
  DailyOperationsPackageSchema,
  DailyOperationsSnapshotSchema,
} from "../../domain/operations";
import {
  FleetEvaluationSchema,
  SupportQueueItemSchema,
  evaluateOperationsFleet,
  type FleetEvaluation,
} from "./evaluateFleet";
import {
  createDailyOperationsSnapshot,
} from "./createDailyOperationsSnapshot";
import type { DailyOperationsSnapshot } from "../../domain/operations";
import type { OperationsDecisionWorkspace } from "./createDecisionWorkspace";

const OperationsDecisionArtifactsSchema = z
  .object({
    queueItem: SupportQueueItemSchema,
    decision: DecisionRecordSchema,
    candidates: z.array(InterventionCandidateSchema).min(1),
    evaluations: z.array(InterventionEvaluationSchema).min(1),
    selectedCandidate: InterventionCandidateSchema,
    selectedEvaluation: InterventionEvaluationSchema,
    baselinePlanVersions: z.record(z.string(), z.string().min(1)),
  })
  .strict();

const PersistedDecisionWorkspaceSchema = z
  .object({
    schemaVersion: z.literal("operations-decision-workspace-v1"),
    snapshotId: z.string().min(3),
    snapshotVersion: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }),
    supportQueue: z.array(SupportQueueItemSchema),
    decisions: z.array(OperationsDecisionArtifactsSchema),
    store: z
      .object({
        activePlan: ScenarioFixtureSchema,
        appliedDecisionVersions: z.record(z.string(), z.string()),
        pendingCustomerNoticeIds: z.record(
          z.string(),
          z.array(z.string()),
        ),
        customerNoticeDrafts: z
          .record(
            z.string(),
            z
              .object({
                schemaVersion: z.literal("customer-notice-v1"),
                noticeId: z.string().min(3),
                decisionId: z.string().min(3),
                stopId: z.string().min(3),
                appliedPlanVersion: z.string().min(1),
                generatedAt: z.string().datetime({ offset: true }),
                channel: z.literal("ALIMTALK_PREVIEW"),
                updatedEta: z.string().datetime({ offset: true }),
                reasonCode: z.literal("SAFE_OPERATION_ADJUSTMENT"),
                message: z.string().min(1).max(500),
                generationMode: z.literal("TEMPLATE"),
                citationIds: z.array(z.string().min(3)).min(1),
                deliveryStatus: z.literal("PREVIEW_ONLY"),
                provenance: z.array(
                  z
                    .object({
                      kind: z.literal("DERIVED"),
                      sourceId: z.string().min(3),
                      sourceLabel: z.string().min(1).max(200),
                      collectedAt: z.string().datetime({ offset: true }),
                      validAt: z.string().datetime({ offset: true }),
                      transformedBy: z.string().min(1),
                      parentSourceIds: z.array(z.string().min(3)).min(1),
                      isDemo: z.literal(true),
                    })
                    .strict(),
                ).min(1),
                actualDeliverySent: z.literal(false),
              })
              .strict(),
          )
          .default({}),
      })
      .strict(),
  })
  .strict();

export const OperationsPersistedSessionSchema = z
  .object({
    schemaVersion: z.literal("operations-persisted-session-v1"),
    workspaceId: z
      .string()
      .regex(/^operations-workspace-[a-f0-9-]{36}$/),
    savedAt: z.string().datetime({ offset: true }),
    operationsPackage: DailyOperationsPackageSchema,
    snapshotIdentity: z
      .object({
        snapshotId: z.string().min(3),
        snapshotVersion: z.string().min(1),
        packageHash: z.string().length(64),
        createdAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    workspace: PersistedDecisionWorkspaceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const snapshotIds = [
      value.snapshotIdentity.snapshotId,
      value.workspace.snapshotId,
    ];
    if (new Set(snapshotIds).size !== 1) {
      context.addIssue({
        code: "custom",
        path: ["snapshot"],
        message: "Persisted operations state must use one snapshot",
      });
    }
  });

export type OperationsPersistedSession = z.infer<
  typeof OperationsPersistedSessionSchema
>;

export type OperationsPersistenceResult =
  | {
      status: "SAVED";
      storage: "D1" | "MEMORY_DEV";
      updatedAt: string;
    }
  | {
      status: "LOADED";
      storage: "D1" | "MEMORY_DEV";
      updatedAt: string;
      session: OperationsPersistedSession;
    }
  | { status: "EMPTY" }
  | { status: "CONFLICT"; message: string; updatedAt?: string }
  | { status: "UNAVAILABLE"; message: string }
  | { status: "INVALID"; message: string };

const workspaceStorageKey = "saferoute.synthetic-operations.workspace-id.v1";

export function getOrCreateOperationsWorkspaceId(storage: Storage) {
  const current = storage.getItem(workspaceStorageKey);
  if (
    current &&
    /^operations-workspace-[a-f0-9-]{36}$/.test(current)
  ) {
    return current;
  }
  const workspaceId = `operations-workspace-${globalThis.crypto.randomUUID()}`;
  storage.setItem(workspaceStorageKey, workspaceId);
  return workspaceId;
}

export function createOperationsPersistedSession(
  input: {
    workspaceId: string;
    operationsPackage: z.infer<typeof DailyOperationsPackageSchema>;
    snapshot: DailyOperationsSnapshot;
    fleet: FleetEvaluation;
    workspace: OperationsDecisionWorkspace;
    savedAt?: string;
  },
) {
  if (
    input.snapshot.snapshotId !== input.fleet.snapshotId ||
    input.snapshot.snapshotId !== input.workspace.snapshotId
  ) {
    throw new Error("Persisted operations state must use one snapshot");
  }
  return OperationsPersistedSessionSchema.parse({
    schemaVersion: "operations-persisted-session-v1",
    workspaceId: input.workspaceId,
    operationsPackage: input.operationsPackage,
    snapshotIdentity: {
      snapshotId: input.snapshot.snapshotId,
      snapshotVersion: input.snapshot.snapshotVersion,
      packageHash: input.snapshot.packageHash,
      createdAt: input.snapshot.createdAt,
    },
    workspace: input.workspace,
    savedAt: input.savedAt ?? new Date().toISOString(),
  });
}

export async function restoreOperationsPersistedSession(
  session: OperationsPersistedSession,
) {
  const validated = OperationsPersistedSessionSchema.parse(session);
  const snapshot = await createDailyOperationsSnapshot(
    validated.operationsPackage,
    {
      snapshotVersion: validated.snapshotIdentity.snapshotVersion,
      createdAt: validated.snapshotIdentity.createdAt,
    },
  );
  if (
    snapshot.snapshotId !== validated.snapshotIdentity.snapshotId ||
    snapshot.packageHash !== validated.snapshotIdentity.packageHash
  ) {
    throw new Error(
      "저장된 운영 패키지가 확정된 스냅샷 해시와 일치하지 않습니다.",
    );
  }
  const fleet = FleetEvaluationSchema.parse(
    evaluateOperationsFleet(snapshot),
  );
  return {
    operationsPackage: validated.operationsPackage,
    snapshot,
    fleet,
    workspace: validated.workspace as OperationsDecisionWorkspace,
  };
}

export async function saveOperationsPersistedSession(
  session: OperationsPersistedSession,
  options: { baseSavedAt?: string } = {},
): Promise<OperationsPersistenceResult> {
  const validated = OperationsPersistedSessionSchema.parse(session);
  try {
    const response = await fetch(
      `/api/operations/sessions/${encodeURIComponent(validated.workspaceId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(options.baseSavedAt
            ? {
                "X-SafeRoute-Base-Saved-At": options.baseSavedAt,
              }
            : {}),
        },
        body: JSON.stringify(validated),
      },
    );
    const body = (await response.json()) as {
      error?: string;
      code?: string;
      updatedAt?: string;
      storage?: "D1" | "MEMORY_DEV";
    };
    if (!response.ok) {
      if (response.status === 409 && body.code === "SESSION_CONFLICT") {
        return {
          status: "CONFLICT",
          message:
            body.error ??
            "다른 화면의 변경을 먼저 다시 불러와야 합니다.",
          updatedAt: body.updatedAt,
        };
      }
      return response.status === 503
        ? {
            status: "UNAVAILABLE",
            message: body.error ?? "운영 저장소를 사용할 수 없습니다.",
          }
        : {
            status: "INVALID",
            message: body.error ?? "운영 세션 저장을 거부했습니다.",
          };
    }
    return {
      status: "SAVED",
      storage: body.storage ?? "D1",
      updatedAt: body.updatedAt ?? validated.savedAt,
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      message: "운영 저장소에 연결할 수 없습니다.",
    };
  }
}

export async function loadOperationsPersistedSession(
  workspaceId: string,
): Promise<OperationsPersistenceResult> {
  try {
    const response = await fetch(
      `/api/operations/sessions/${encodeURIComponent(workspaceId)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );
    if (response.status === 404) return { status: "EMPTY" };
    const body = (await response.json()) as {
      error?: string;
      updatedAt?: string;
      storage?: "D1" | "MEMORY_DEV";
      session?: unknown;
    };
    if (!response.ok) {
      return {
        status: "UNAVAILABLE",
        message: body.error ?? "운영 저장소를 사용할 수 없습니다.",
      };
    }
    const parsed = OperationsPersistedSessionSchema.safeParse(body.session);
    if (!parsed.success) {
      return {
        status: "INVALID",
        message: "저장된 운영 세션 계약이 유효하지 않습니다.",
      };
    }
    return {
      status: "LOADED",
      storage: body.storage ?? "D1",
      updatedAt: body.updatedAt ?? parsed.data.savedAt,
      session: parsed.data,
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      message: "운영 저장소에 연결할 수 없습니다.",
    };
  }
}
