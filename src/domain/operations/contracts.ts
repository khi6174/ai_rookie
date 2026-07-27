import { z } from "zod";
import {
  IsoDateTimeSchema,
  ProvenanceSchema,
  ScenarioFixtureSchema,
} from "../contracts/schemas";

const opaqueId = z.string().min(3).max(120);
const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.min(0);
const nonNegativeInteger = z.number().int().min(0);
const operationDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SyntheticOperationsParentRecordSchema = z
  .object({
    schemaVersion: z.literal("synthetic-operations-parent-v1"),
    datasetVersion: z.string().min(1).max(100),
    parentRecordId: opaqueId,
    batchId: opaqueId,
    split: z.enum(["development", "validation", "frozen-test"]),
    seed: z.number().int().min(0),
    createdAt: IsoDateTimeSchema,
    dataMode: z.literal("SYNTHETIC"),
    provenance: z
      .object({
        kind: z.literal("MOCK"),
        sourceId: opaqueId,
        sourceLabel: z.string().min(1).max(200),
        transformedBy: z.string().min(1).max(200),
        isDemo: z.literal(true),
      })
      .strict(),
    generator: z
      .object({
        generator: z.literal("RULE_ENGINE"),
        provider: z.literal("SafeRoute"),
        modelId: z.literal("none"),
        promptFamily: z.string().min(1).max(100),
        promptVersion: z.string().min(1).max(100),
        validationStatus: z.literal("ACCEPTED"),
        validationReportId: opaqueId,
      })
      .strict(),
    scenario: z.enum(["RAIN_SLOPE", "HEAT_STAIRS", "LOW_VISIBILITY"]),
    hub: z
      .object({
        hubId: opaqueId,
        label: z.string().min(1).max(100),
      })
      .strict(),
    courier: z
      .object({
        courierId: opaqueId,
        displayLabel: z.string().min(1).max(100),
      })
      .strict(),
    vehicle: z
      .object({
        vehicleId: opaqueId,
        capacityKg: finiteNumber.positive().max(10_000),
      })
      .strict(),
    shift: z
      .object({
        shiftId: opaqueId,
        startAt: IsoDateTimeSchema,
        evaluatedAt: IsoDateTimeSchema,
        endAt: IsoDateTimeSchema,
        continuousWorkMinutes: nonNegativeInteger.max(24 * 60),
        plannedBreakMinutes: nonNegativeInteger.max(24 * 60),
      })
      .strict(),
    plan: z
      .object({
        planId: opaqueId,
        planVersion: z.string().min(1).max(100),
        totalStopCount: nonNegativeInteger,
        completedStopCount: nonNegativeInteger,
        remainingStopCount: nonNegativeInteger,
        remainingWeightKg: nonNegativeNumber,
        stops: z
          .array(
            z
              .object({
                stopId: opaqueId,
                sequence: z.number().int().min(1),
                eta: IsoDateTimeSchema,
                coarseZone: z.string().min(1).max(160),
                taskType: z.enum([
                  "문앞 전달",
                  "경비실 전달",
                  "무인보관함 전달",
                ]),
                weightKg: nonNegativeNumber.max(500),
              })
              .strict(),
          )
          .min(1)
          .max(200),
      })
      .strict(),
    operatingConditions: z
      .object({
        rainfallMmPerHour: nonNegativeNumber.max(500),
        apparentTemperatureC: finiteNumber.min(-60).max(80),
        visibilityMeters: nonNegativeNumber.max(100_000),
        maxSlopePercent: nonNegativeNumber.max(100),
        stairsStopCount: nonNegativeInteger.max(200),
      })
      .strict(),
    safetyObservation: z
      .object({
        observationId: opaqueId,
        category: z.string().min(1).max(100),
        accidentOccurred: z.literal(false),
        purpose: z.literal("사고예방 운영 검토"),
        nonPunitive: z.literal(true),
        containsUntrustedInstruction: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const DailyOperationsPackageSchema = z
  .object({
    schemaVersion: z.literal("daily-operations-package-v1"),
    packageId: opaqueId,
    operationDate,
    evaluatedAt: IsoDateTimeSchema,
    timeZone: z.literal("Asia/Seoul"),
    dataMode: z.literal("SYNTHETIC"),
    source: z.enum(["BUNDLED_SAMPLE", "USER_UPLOADED"]),
    records: z.array(SyntheticOperationsParentRecordSchema).min(1).max(500),
  })
  .strict();

export const OperationsSourceDocumentKindSchema = z.enum([
  "DELIVERY_WORK_SHEET",
  "SHIFT_ROSTER",
  "ROUTE_STOP_MANIFEST",
  "SAFETY_INCIDENT_PREVENTION_REPORT",
]);

export const OperationsSourceDocumentSchema = z
  .object({
    schemaVersion: z.literal("operations-source-document-v1"),
    documentId: opaqueId,
    parentRecordId: opaqueId,
    documentKind: OperationsSourceDocumentKindSchema,
    sourceFormat: z.literal("MARKDOWN"),
    mediaType: z.literal("text/markdown"),
    dataMode: z.literal("SYNTHETIC"),
    content: z.string().min(200).max(12_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const DailyOperationsDocumentBundleSchema = z
  .object({
    schemaVersion: z.literal("daily-operations-document-bundle-v1"),
    bundleId: opaqueId,
    operationDate,
    evaluatedAt: IsoDateTimeSchema,
    timeZone: z.literal("Asia/Seoul"),
    dataMode: z.literal("SYNTHETIC"),
    source: z.enum(["BUNDLED_SAMPLE", "USER_UPLOADED"]),
    extraction: z
      .object({
        provider: z.enum(["SAFEROUTE", "UPSTAGE"]),
        mode: z.enum(["DETERMINISTIC", "LIVE", "FALLBACK"]),
        model: z.string().min(1).max(120),
        completedAt: IsoDateTimeSchema,
        validationStatus: z.literal("ACCEPTED"),
        rawDocumentStored: z.literal(false),
        rawOutputStored: z.literal(false),
      })
      .strict(),
    documents: z.array(OperationsSourceDocumentSchema).min(4).max(2_000),
    extractedRecords: z
      .array(SyntheticOperationsParentRecordSchema)
      .min(1)
      .max(500),
  })
  .strict();

export const OperationsValidationIssueSchema = z
  .object({
    issueId: opaqueId,
    severity: z.enum(["ERROR", "WARNING"]),
    code: z.enum([
      "SCHEMA_INVALID",
      "DATE_MISMATCH",
      "DUPLICATE_ID",
      "MISSING_REFERENCE",
      "TIME_ORDER_INVALID",
      "COUNT_MISMATCH",
      "LOAD_MISMATCH",
      "UNSUPPORTED_DATA_MODE",
      "PII_PATTERN_DETECTED",
      "DOCUMENT_MISSING",
      "DOCUMENT_HASH_MISMATCH",
      "DOCUMENT_REFERENCE_MISMATCH",
    ]),
    recordId: opaqueId.optional(),
    fieldPath: z.string().min(1).max(300).optional(),
    message: z.string().min(1).max(500),
  })
  .strict();

export const DailyOperationsSnapshotSchema = z
  .object({
    schemaVersion: z.literal("daily-operations-snapshot-v1"),
    snapshotId: opaqueId,
    snapshotVersion: z.string().min(1).max(100),
    packageId: opaqueId,
    packageHash: z.string().regex(/^[a-f0-9]{64}$/),
    operationDate,
    evaluatedAt: IsoDateTimeSchema,
    timeZone: z.literal("Asia/Seoul"),
    dataMode: z.literal("SYNTHETIC"),
    status: z.enum(["ACTIVE", "SUPERSEDED"]),
    courierIds: z.array(opaqueId).min(1),
    planIds: z.array(opaqueId).min(1),
    fixture: ScenarioFixtureSchema,
    createdAt: IsoDateTimeSchema,
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const fixtureCourierIds = value.fixture.couriers.map(
      (courier) => courier.courierId,
    );
    const fixturePlanIds = value.fixture.workloads.map(
      (workload) => workload.planId,
    );
    if (
      [...fixtureCourierIds].sort().join("|") !==
      [...value.courierIds].sort().join("|")
    ) {
      context.addIssue({
        code: "custom",
        path: ["courierIds"],
        message: "Snapshot courier IDs must match the fixture",
      });
    }
    if (
      [...fixturePlanIds].sort().join("|") !==
      [...value.planIds].sort().join("|")
    ) {
      context.addIssue({
        code: "custom",
        path: ["planIds"],
        message: "Snapshot plan IDs must match the fixture",
      });
    }
  });

export type SyntheticOperationsParentRecord = z.infer<
  typeof SyntheticOperationsParentRecordSchema
>;
export type DailyOperationsPackage = z.infer<
  typeof DailyOperationsPackageSchema
>;
export type OperationsSourceDocument = z.infer<
  typeof OperationsSourceDocumentSchema
>;
export type DailyOperationsDocumentBundle = z.infer<
  typeof DailyOperationsDocumentBundleSchema
>;
export type OperationsValidationIssue = z.infer<
  typeof OperationsValidationIssueSchema
>;
export type DailyOperationsSnapshot = z.infer<
  typeof DailyOperationsSnapshotSchema
>;

export type DailyOperationsValidationResult =
  | {
      status: "VALID";
      package: DailyOperationsPackage;
      issues: OperationsValidationIssue[];
    }
  | {
      status: "INVALID";
      issues: OperationsValidationIssue[];
    };

export type DailyOperationsInputResult =
  | {
      status: "VALID";
      inputKind: "NORMALIZED_PACKAGE" | "DOCUMENT_BUNDLE";
      package: DailyOperationsPackage;
      issues: OperationsValidationIssue[];
      documentCount: number;
      extraction?: DailyOperationsDocumentBundle["extraction"];
    }
  | {
      status: "INVALID";
      inputKind: "NORMALIZED_PACKAGE" | "DOCUMENT_BUNDLE" | "UNKNOWN";
      issues: OperationsValidationIssue[];
    };

let nextIssueId = 1;

function issue(input: Omit<OperationsValidationIssue, "issueId">) {
  return OperationsValidationIssueSchema.parse({
    ...input,
    issueId: `operations-issue-${String(nextIssueId++).padStart(4, "0")}`,
  });
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateDailyOperationsPackage(
  input: unknown,
): DailyOperationsValidationResult {
  nextIssueId = 1;
  const parsed = DailyOperationsPackageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "INVALID",
      issues: parsed.error.issues.map((zodIssue) =>
        issue({
          severity: "ERROR",
          code:
            zodIssue.path.at(-1) === "dataMode"
              ? "UNSUPPORTED_DATA_MODE"
              : "SCHEMA_INVALID",
          fieldPath: zodIssue.path.join(".") || "package",
          message: zodIssue.message,
        }),
      ),
    };
  }

  const operationsPackage = parsed.data;
  const issues: OperationsValidationIssue[] = [];
  const add = (value: Omit<OperationsValidationIssue, "issueId">) => {
    issues.push(issue(value));
  };

  const idGroups = [
    [
      "parentRecordId",
      operationsPackage.records.map((record) => record.parentRecordId),
    ],
    [
      "courier.courierId",
      operationsPackage.records.map((record) => record.courier.courierId),
    ],
    [
      "vehicle.vehicleId",
      operationsPackage.records.map((record) => record.vehicle.vehicleId),
    ],
    [
      "shift.shiftId",
      operationsPackage.records.map((record) => record.shift.shiftId),
    ],
    [
      "plan.planId",
      operationsPackage.records.map((record) => record.plan.planId),
    ],
    [
      "plan.stops.stopId",
      operationsPackage.records.flatMap((record) =>
        record.plan.stops.map((stop) => stop.stopId),
      ),
    ],
  ] as const;
  for (const [fieldPath, values] of idGroups) {
    for (const duplicate of duplicateValues([...values])) {
      add({
        severity: "ERROR",
        code: "DUPLICATE_ID",
        fieldPath,
        message: `${fieldPath}에 중복 ID ${duplicate}가 있습니다.`,
      });
    }
  }

  const serialized = JSON.stringify(operationsPackage);
  if (
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(serialized) ||
    /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/.test(serialized)
  ) {
    add({
      severity: "ERROR",
      code: "PII_PATTERN_DETECTED",
      fieldPath: "package",
      message: "이메일 또는 휴대전화번호 형태의 값이 감지되었습니다.",
    });
  }

  for (const record of operationsPackage.records) {
    const recordId = record.parentRecordId;
    const recordDate = record.shift.evaluatedAt.slice(0, 10);
    if (recordDate !== operationsPackage.operationDate) {
      add({
        severity: "ERROR",
        code: "DATE_MISMATCH",
        recordId,
        fieldPath: "shift.evaluatedAt",
        message: `운영일 ${operationsPackage.operationDate}과 기준일 ${recordDate}이 다릅니다.`,
      });
    }

    const shiftStart = Date.parse(record.shift.startAt);
    const evaluatedAt = Date.parse(record.shift.evaluatedAt);
    const shiftEnd = Date.parse(record.shift.endAt);
    if (!(shiftStart <= evaluatedAt && evaluatedAt < shiftEnd)) {
      add({
        severity: "ERROR",
        code: "TIME_ORDER_INVALID",
        recordId,
        fieldPath: "shift",
        message: "근무 시작 ≤ 평가시각 < 근무 종료 순서를 충족해야 합니다.",
      });
    }

    if (
      record.plan.totalStopCount !==
      record.plan.completedStopCount + record.plan.remainingStopCount
    ) {
      add({
        severity: "ERROR",
        code: "COUNT_MISMATCH",
        recordId,
        fieldPath: "plan.totalStopCount",
        message: "전체 배송 수가 완료 배송과 남은 배송의 합과 다릅니다.",
      });
    }
    if (record.plan.remainingStopCount !== record.plan.stops.length) {
      add({
        severity: "ERROR",
        code: "COUNT_MISMATCH",
        recordId,
        fieldPath: "plan.remainingStopCount",
        message: "남은 배송 수가 배송지 목록 길이와 다릅니다.",
      });
    }

    const remainingWeight = record.plan.stops.reduce(
      (total, stop) => total + stop.weightKg,
      0,
    );
    if (Math.abs(remainingWeight - record.plan.remainingWeightKg) > 0.001) {
      add({
        severity: "ERROR",
        code: "LOAD_MISMATCH",
        recordId,
        fieldPath: "plan.remainingWeightKg",
        message: "남은 적재중량이 배송지 중량 합과 다릅니다.",
      });
    }

    const sequences = record.plan.stops.map((stop) => stop.sequence);
    if (
      duplicateValues(sequences.map(String)).length > 0 ||
      [...sequences].sort((left, right) => left - right).some(
        (sequence, index) => sequence !== index + 1,
      )
    ) {
      add({
        severity: "ERROR",
        code: "MISSING_REFERENCE",
        recordId,
        fieldPath: "plan.stops.sequence",
        message: "배송순서는 1부터 빠짐없이 한 번씩 있어야 합니다.",
      });
    }
    if (
      record.plan.stops.some(
        (stop) => Date.parse(stop.eta) <= Date.parse(record.shift.evaluatedAt),
      )
    ) {
      add({
        severity: "ERROR",
        code: "TIME_ORDER_INVALID",
        recordId,
        fieldPath: "plan.stops.eta",
        message: "남은 배송 ETA는 기사 평가시각 이후여야 합니다.",
      });
    }
  }

  if (issues.some((item) => item.severity === "ERROR")) {
    return { status: "INVALID", issues };
  }
  return { status: "VALID", package: operationsPackage, issues };
}

const requiredDocumentKinds = OperationsSourceDocumentKindSchema.options;

function containsPiiPattern(value: string) {
  return (
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value) ||
    /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/.test(value)
  );
}

async function sha256Text(value: string) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

export async function normalizeDailyOperationsInput(
  input: unknown,
): Promise<DailyOperationsInputResult> {
  nextIssueId = 1;
  if (
    input &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion === "daily-operations-package-v1"
  ) {
    const packageResult = validateDailyOperationsPackage(input);
    return packageResult.status === "VALID"
      ? {
          ...packageResult,
          inputKind: "NORMALIZED_PACKAGE",
          documentCount: 0,
        }
      : { ...packageResult, inputKind: "NORMALIZED_PACKAGE" };
  }

  const bundle = DailyOperationsDocumentBundleSchema.safeParse(input);
  if (!bundle.success) {
    return {
      status: "INVALID",
      inputKind:
        input &&
        typeof input === "object" &&
        "schemaVersion" in input &&
        input.schemaVersion === "daily-operations-document-bundle-v1"
          ? "DOCUMENT_BUNDLE"
          : "UNKNOWN",
      issues: bundle.error.issues.map((zodIssue) =>
        issue({
          severity: "ERROR",
          code:
            zodIssue.path.at(-1) === "dataMode"
              ? "UNSUPPORTED_DATA_MODE"
              : "SCHEMA_INVALID",
          fieldPath: zodIssue.path.join(".") || "bundle",
          message: zodIssue.message,
        }),
      ),
    };
  }

  const issues: OperationsValidationIssue[] = [];
  const add = (value: Omit<OperationsValidationIssue, "issueId">) => {
    issues.push(issue(value));
  };
  const documentsByParent = new Map<
    string,
    DailyOperationsDocumentBundle["documents"]
  >();

  for (const document of bundle.data.documents) {
    const current = documentsByParent.get(document.parentRecordId) ?? [];
    current.push(document);
    documentsByParent.set(document.parentRecordId, current);
    if (containsPiiPattern(document.content)) {
      add({
        severity: "ERROR",
        code: "PII_PATTERN_DETECTED",
        recordId: document.parentRecordId,
        fieldPath: `documents.${document.documentId}.content`,
        message: `${document.documentId}에서 이메일 또는 휴대전화번호 형태가 감지되었습니다.`,
      });
    }
    if (
      !document.content.includes(document.parentRecordId) ||
      !document.content.includes("SYNTHETIC")
    ) {
      add({
        severity: "ERROR",
        code: "DOCUMENT_REFERENCE_MISMATCH",
        recordId: document.parentRecordId,
        fieldPath: `documents.${document.documentId}.content`,
        message: `${document.documentId}의 상위 레코드 또는 합성 데이터 표시가 일치하지 않습니다.`,
      });
    }
    if ((await sha256Text(document.content)) !== document.sha256) {
      add({
        severity: "ERROR",
        code: "DOCUMENT_HASH_MISMATCH",
        recordId: document.parentRecordId,
        fieldPath: `documents.${document.documentId}.sha256`,
        message: `${document.documentId}의 내용 해시가 등록된 해시와 다릅니다.`,
      });
    }
  }

  const recordIds = new Set(
    bundle.data.extractedRecords.map((record) => record.parentRecordId),
  );
  for (const record of bundle.data.extractedRecords) {
    const documents = documentsByParent.get(record.parentRecordId) ?? [];
    const kinds = new Set(documents.map((document) => document.documentKind));
    for (const kind of requiredDocumentKinds) {
      if (!kinds.has(kind)) {
        add({
          severity: "ERROR",
          code: "DOCUMENT_MISSING",
          recordId: record.parentRecordId,
          fieldPath: "documents",
          message: `${record.parentRecordId}에 ${kind} 문서가 없습니다.`,
        });
      }
    }
    if (
      documents.length !== requiredDocumentKinds.length ||
      kinds.size !== requiredDocumentKinds.length
    ) {
      add({
        severity: "ERROR",
        code: "DOCUMENT_REFERENCE_MISMATCH",
        recordId: record.parentRecordId,
        fieldPath: "documents",
        message: `${record.parentRecordId}에는 네 종류의 문서가 각각 한 개씩 있어야 합니다.`,
      });
    }
    const combined = documents.map((document) => document.content).join("\n");
    for (const expectedReference of [
      record.courier.courierId,
      record.shift.shiftId,
      record.plan.planId,
      record.vehicle.vehicleId,
    ]) {
      if (!combined.includes(expectedReference)) {
        add({
          severity: "ERROR",
          code: "DOCUMENT_REFERENCE_MISMATCH",
          recordId: record.parentRecordId,
          fieldPath: "documents",
          message: `${record.parentRecordId} 문서에서 ${expectedReference} 참조를 확인할 수 없습니다.`,
        });
      }
    }
  }
  for (const parentRecordId of documentsByParent.keys()) {
    if (!recordIds.has(parentRecordId)) {
      add({
        severity: "ERROR",
        code: "DOCUMENT_REFERENCE_MISMATCH",
        recordId: parentRecordId,
        fieldPath: "documents",
        message: `${parentRecordId} 문서에 대응하는 추출 레코드가 없습니다.`,
      });
    }
  }

  const normalizedPackage = DailyOperationsPackageSchema.parse({
    schemaVersion: "daily-operations-package-v1",
    packageId: `${bundle.data.bundleId}-normalized`,
    operationDate: bundle.data.operationDate,
    evaluatedAt: bundle.data.evaluatedAt,
    timeZone: bundle.data.timeZone,
    dataMode: bundle.data.dataMode,
    source: bundle.data.source,
    records: bundle.data.extractedRecords,
  });
  const packageResult = validateDailyOperationsPackage(normalizedPackage);
  if (packageResult.status === "INVALID") {
    issues.push(...packageResult.issues);
  }
  if (issues.some((item) => item.severity === "ERROR")) {
    return { status: "INVALID", inputKind: "DOCUMENT_BUNDLE", issues };
  }
  return {
    status: "VALID",
    inputKind: "DOCUMENT_BUNDLE",
    package: normalizedPackage,
    issues,
    documentCount: bundle.data.documents.length,
    extraction: bundle.data.extraction,
  };
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeForHash(item)]),
  );
}

export async function hashDailyOperationsPackage(
  operationsPackage: DailyOperationsPackage,
) {
  const serialized = JSON.stringify(normalizeForHash(operationsPackage));
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
