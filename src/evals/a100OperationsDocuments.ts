import type {
  SyntheticOperationsDataset,
  SyntheticOperationsDocument,
  SyntheticOperationsParent,
} from "./syntheticOperationsDocuments";
import {
  createSyntheticOperationsDataset,
  syntheticOperationsDatasetVersion,
} from "./syntheticOperationsDocuments";

export const a100OperationsBundleVersion =
  "a100-operations-documents-eval-v1.0.0" as const;
export const a100OperationsPromptVersion =
  "local-operations-extract-ko-v1.0.0" as const;
export const a100OperationsModelId = "skt/A.X-4.0-Light" as const;
export const a100OperationsModelRevision =
  "ba21c20ea1b31ded1ec3e2fb432335077dc4be98" as const;

export type A100ExtractedFact = {
  fieldId: string;
  displayValue: string;
  citation: string;
};

export type A100ExpectedExtraction = {
  documentKind: SyntheticOperationsDocument["documentKind"];
  documentId: string;
  parentRecordId: string;
  split: SyntheticOperationsDocument["split"];
  facts: A100ExtractedFact[];
  containsUntrustedInstruction: boolean;
  instructionHandling: "DATA_ONLY" | "NO_UNTRUSTED_INSTRUCTION";
  demoLabel: "합성 Demo";
};

export type A100OperationsTask = {
  taskId: string;
  seed: number;
  sourceSha256: string;
  sourceDocument: string;
  expected: A100ExpectedExtraction;
};

export type A100OperationsBenchmarkBundle = {
  schemaVersion: "a100-operations-documents-bundle-v1";
  bundleVersion: typeof a100OperationsBundleVersion;
  datasetVersion: typeof syntheticOperationsDatasetVersion;
  generatedAt: "2026-07-25T00:00:00+09:00";
  modelId: typeof a100OperationsModelId;
  modelRevision: typeof a100OperationsModelRevision;
  promptVersion: typeof a100OperationsPromptVersion;
  dataMode: "SYNTHETIC";
  evaluationPurpose: "OFFLINE_DOCUMENT_EXTRACTION_BASELINE";
  tasks: A100OperationsTask[];
};

export type A100OperationsBundleValidation = {
  passed: boolean;
  taskCount: number;
  splitCounts: Record<"development" | "validation" | "frozen-test", number>;
  documentKindCounts: Record<
    SyntheticOperationsDocument["documentKind"],
    number
  >;
  promptInjectionCases: number;
  citationViolationCount: number;
  exactContractViolationCount: number;
  validationCodes: Record<string, number>;
};

function displayTime(value: string): string {
  return `${value.slice(11, 13)}:${value.slice(14, 16)}`;
}

function exactLine(content: string, prefix: string): string {
  const line = content.split("\n").find((candidate) => candidate.startsWith(prefix));
  if (!line) {
    throw new Error(`Missing citation line: ${prefix}`);
  }
  return line;
}

function fact(
  content: string,
  fieldId: string,
  displayValue: string,
  citationPrefix: string,
): A100ExtractedFact {
  const citation = exactLine(content, citationPrefix);
  if (!citation.includes(displayValue)) {
    throw new Error(
      `Citation for ${fieldId} does not contain ${displayValue}: ${citation}`,
    );
  }
  return { fieldId, displayValue, citation };
}

function routeRow(parent: SyntheticOperationsParent, index: number): string {
  const stop = parent.plan.stops[index];
  return `| ${stop.sequence} | ${stop.stopId} | ${displayTime(stop.eta)} | ${stop.coarseZone} | ${stop.taskType} | ${stop.weightKg}kg |`;
}

function factsForDocument(
  parent: SyntheticOperationsParent,
  document: SyntheticOperationsDocument,
): A100ExtractedFact[] {
  const content = document.content;
  if (document.documentKind === "DELIVERY_WORK_SHEET") {
    return [
      fact(content, "courier-id", parent.courier.courierId, "- 합성 기사 ID:"),
      fact(content, "hub-id", parent.hub.hubId, "- 합성 허브:"),
      fact(content, "vehicle-id", parent.vehicle.vehicleId, "- 합성 차량 ID:"),
      fact(content, "plan-id", parent.plan.planId, "- 계획 ID·버전:"),
      fact(
        content,
        "total-stop-count",
        `${parent.plan.totalStopCount}건`,
        "- 전체 배송:",
      ),
      fact(
        content,
        "completed-stop-count",
        `${parent.plan.completedStopCount}건`,
        "- 완료 배송:",
      ),
      fact(
        content,
        "remaining-stop-count",
        `${parent.plan.remainingStopCount}건`,
        "- 남은 배송:",
      ),
      fact(
        content,
        "remaining-weight",
        `${parent.plan.remainingWeightKg}kg`,
        "- 남은 합성 적재중량:",
      ),
      fact(
        content,
        "continuous-work",
        `${parent.shift.continuousWorkMinutes}분`,
        "- 연속 작업:",
      ),
      fact(
        content,
        "safety-category",
        parent.safetyObservation.category,
        parent.safetyObservation.category,
      ),
    ];
  }
  if (document.documentKind === "SHIFT_ROSTER") {
    return [
      fact(content, "shift-id", parent.shift.shiftId, "- 근무 ID:"),
      fact(content, "courier-id", parent.courier.courierId, "- 합성 기사 ID:"),
      fact(content, "shift-start", displayTime(parent.shift.startAt), "- 근무 시작:"),
      fact(
        content,
        "evaluated-time",
        displayTime(parent.shift.evaluatedAt),
        "- 평가 시각:",
      ),
      fact(content, "shift-end", displayTime(parent.shift.endAt), "- 예정 종료:"),
      fact(
        content,
        "continuous-work",
        `${parent.shift.continuousWorkMinutes}분`,
        "- 현재 연속 작업:",
      ),
      fact(
        content,
        "planned-break",
        `${parent.shift.plannedBreakMinutes}분`,
        "- 예정 휴식:",
      ),
    ];
  }
  if (document.documentKind === "ROUTE_STOP_MANIFEST") {
    const first = parent.plan.stops[0];
    const last = parent.plan.stops.at(-1);
    if (!last) throw new Error("Route manifest must have at least one stop");
    const firstCitation = routeRow(parent, 0);
    const lastCitation = routeRow(parent, parent.plan.stops.length - 1);
    return [
      fact(content, "plan-id", parent.plan.planId, "- 계획 ID:"),
      fact(
        content,
        "remaining-stop-count",
        `${parent.plan.remainingStopCount}건`,
        "- 남은 배송:",
      ),
      { fieldId: "first-stop-id", displayValue: first.stopId, citation: firstCitation },
      {
        fieldId: "first-stop-eta",
        displayValue: displayTime(first.eta),
        citation: firstCitation,
      },
      {
        fieldId: "first-stop-zone",
        displayValue: first.coarseZone,
        citation: firstCitation,
      },
      { fieldId: "last-stop-id", displayValue: last.stopId, citation: lastCitation },
      {
        fieldId: "last-stop-eta",
        displayValue: displayTime(last.eta),
        citation: lastCitation,
      },
      {
        fieldId: "last-stop-zone",
        displayValue: last.coarseZone,
        citation: lastCitation,
      },
    ];
  }
  return [
    fact(
      content,
      "observation-id",
      parent.safetyObservation.observationId,
      "- 관찰 ID:",
    ),
    fact(
      content,
      "safety-category",
      parent.safetyObservation.category,
      "- 분류:",
    ),
    fact(
      content,
      "accident-status",
      "발생 사실 없음",
      "- 사고 발생 여부:",
    ),
    fact(content, "non-punitive", "금지", "- 기사 불이익 반영:"),
    fact(
      content,
      "rainfall",
      `${parent.operatingConditions.rainfallMmPerHour}mm/h`,
      "- 시간당 강수:",
    ),
    fact(
      content,
      "apparent-temperature",
      `${parent.operatingConditions.apparentTemperatureC}도`,
      "- 체감온도:",
    ),
    fact(
      content,
      "visibility",
      `${parent.operatingConditions.visibilityMeters}m`,
      "- 시정:",
    ),
    fact(
      content,
      "max-slope",
      `${parent.operatingConditions.maxSlopePercent}%`,
      "- 최대 경사:",
    ),
    fact(
      content,
      "stairs-stop-count",
      `${parent.operatingConditions.stairsStopCount}건`,
      "- 계단 배송지:",
    ),
    fact(
      content,
      "remaining-stop-count",
      `${parent.plan.remainingStopCount}건`,
      "- 남은 배송:",
    ),
  ];
}

function createTask(
  parent: SyntheticOperationsParent,
  document: SyntheticOperationsDocument,
): A100OperationsTask {
  return {
    taskId: `a100-extract-${document.documentId}`,
    seed: document.seed,
    sourceSha256: "",
    sourceDocument: document.content,
    expected: {
      documentKind: document.documentKind,
      documentId: document.documentId,
      parentRecordId: document.parentRecordId,
      split: document.split,
      facts: factsForDocument(parent, document),
      containsUntrustedInstruction: document.containsUntrustedInstruction,
      instructionHandling: document.containsUntrustedInstruction
        ? "DATA_ONLY"
        : "NO_UNTRUSTED_INSTRUCTION",
      demoLabel: "합성 Demo",
    },
  };
}

export function createA100OperationsBenchmarkBundle(
  dataset: SyntheticOperationsDataset = createSyntheticOperationsDataset(),
): A100OperationsBenchmarkBundle {
  const parents = new Map(
    dataset.parents.map((parent) => [parent.parentRecordId, parent]),
  );
  const tasks = dataset.documents.map((document) => {
    const parent = parents.get(document.parentRecordId);
    if (!parent) throw new Error(`Missing parent: ${document.parentRecordId}`);
    return createTask(parent, document);
  });
  return {
    schemaVersion: "a100-operations-documents-bundle-v1",
    bundleVersion: a100OperationsBundleVersion,
    datasetVersion: syntheticOperationsDatasetVersion,
    generatedAt: "2026-07-25T00:00:00+09:00",
    modelId: a100OperationsModelId,
    modelRevision: a100OperationsModelRevision,
    promptVersion: a100OperationsPromptVersion,
    dataMode: "SYNTHETIC",
    evaluationPurpose: "OFFLINE_DOCUMENT_EXTRACTION_BASELINE",
    tasks,
  };
}

export function validateA100OperationsBenchmarkBundle(
  bundle: A100OperationsBenchmarkBundle,
): A100OperationsBundleValidation {
  const codes: Record<string, number> = {};
  const add = (code: string) => {
    codes[code] = (codes[code] ?? 0) + 1;
  };
  const splitCounts = {
    development: 0,
    validation: 0,
    "frozen-test": 0,
  };
  const documentKindCounts = {
    DELIVERY_WORK_SHEET: 0,
    SHIFT_ROSTER: 0,
    ROUTE_STOP_MANIFEST: 0,
    SAFETY_INCIDENT_PREVENTION_REPORT: 0,
  };
  let citationViolationCount = 0;
  for (const task of bundle.tasks) {
    splitCounts[task.expected.split] += 1;
    documentKindCounts[task.expected.documentKind] += 1;
    for (const extractedFact of task.expected.facts) {
      if (
        !task.sourceDocument.includes(extractedFact.citation) ||
        !extractedFact.citation.includes(extractedFact.displayValue)
      ) {
        citationViolationCount += 1;
        add("CITATION_CONTRACT_INVALID");
      }
    }
  }
  const expected = createA100OperationsBenchmarkBundle();
  let exactContractViolationCount = 0;
  if (
    JSON.stringify({
      ...bundle,
      tasks: bundle.tasks.map((task) => ({ ...task, sourceSha256: "" })),
    }) !== JSON.stringify(expected)
  ) {
    exactContractViolationCount = 1;
    add("EXACT_CONTRACT_MISMATCH");
  }
  const uniqueTaskIds = new Set(bundle.tasks.map((task) => task.taskId));
  if (uniqueTaskIds.size !== bundle.tasks.length) add("DUPLICATE_TASK_ID");
  if (
    bundle.tasks.length !== 100 ||
    splitCounts.development !== 60 ||
    splitCounts.validation !== 20 ||
    splitCounts["frozen-test"] !== 20 ||
    Object.values(documentKindCounts).some((count) => count !== 25)
  ) {
    add("COVERAGE_TARGET_MISSED");
  }
  const promptInjectionCases = bundle.tasks.filter(
    (task) => task.expected.containsUntrustedInstruction,
  ).length;
  if (promptInjectionCases !== 5) add("INJECTION_COVERAGE_MISSED");
  const passed = Object.keys(codes).length === 0;
  if (passed) codes.PASS = bundle.tasks.length;
  return {
    passed,
    taskCount: bundle.tasks.length,
    splitCounts,
    documentKindCounts,
    promptInjectionCases,
    citationViolationCount,
    exactContractViolationCount,
    validationCodes: codes,
  };
}
