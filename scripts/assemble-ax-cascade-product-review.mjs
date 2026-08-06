#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const experimentArgumentIndex = process.argv.indexOf("--experiment");
const experimentVersion =
  experimentArgumentIndex === -1
    ? "v1"
    : process.argv[experimentArgumentIndex + 1];
if (!["v1", "v2"].includes(experimentVersion)) {
  throw new Error(
    "AX_CASCADE_PRODUCT_REVIEW_ASSEMBLY_FAILED code=EXPERIMENT_ARGUMENT",
  );
}
const experimentId = `ax-cascade-product-review-${experimentVersion}`;
const localRoot = path.join(
  root,
  `artifacts/evals/local-model-runs/${experimentId}`,
);
const paths = {
  config: path.join(
    root,
    `config/ax-cascade-product-review-${experimentVersion}.json`,
  ),
  bundle: path.join(root, "artifacts/evals/ax-cascade-product-review-v1.json"),
  localSummary: path.join(
    localRoot,
    `${experimentId}-local-run1/local-only-summary.json`,
  ),
  localResults: path.join(
    localRoot,
    `${experimentId}-local-run1/local-only-results.jsonl`,
  ),
  marker: path.join(
    localRoot,
    experimentVersion === "v1"
      ? "product-review-local-consumed.json"
      : "product-review-v2-local-consumed.json",
  ),
  hosted:
    path.join(
      root,
      "artifacts/evals/domestic-ai-api-runs/2026-07-23T11-08-49-486Z-live-ax/domestic-ai-api-smoke-latest.json",
    ),
  cascadeMock: path.join(
    root,
    "artifacts/evals/domestic-ai-cascade-mock-latest.json",
  ),
  output: path.join(
    root,
    experimentVersion === "v1"
      ? "artifacts/evals/ax-cascade-product-review-latest.json"
      : "artifacts/evals/ax-cascade-product-review-v2-latest.json",
  ),
  priorComparison: path.join(
    root,
    "artifacts/evals/ax-cascade-product-review-latest.json",
  ),
};

const localResultKeys = [
  "taskId",
  "role",
  "containsUntrustedInstruction",
  "status",
  "schemaValid",
  "numericIntegrityValid",
  "citationIntegrityValid",
  "rolePolicyValid",
  "injectionIsolationValid",
  "exactContractMatch",
  "requiredFactsValid",
  "requiredCitationsValid",
  "requiredDisplayValuesValid",
  "failureCodes",
  "outputSha256",
  "promptTokens",
  "completionTokens",
  "generationMs",
  "unsafeDisplayCount",
].sort();

function fail(code) {
  throw new Error(`AX_CASCADE_PRODUCT_REVIEW_ASSEMBLY_FAILED code=${code}`);
}

function requireValue(condition, code) {
  if (!condition) fail(code);
}

async function readJson(filePath) {
  const value = JSON.parse(await readFile(filePath, "utf8"));
  requireValue(value && typeof value === "object" && !Array.isArray(value), "JSON_OBJECT_REQUIRED");
  return value;
}

async function readJsonl(filePath) {
  const content = (await readFile(filePath, "utf8")).trim();
  requireValue(content.length > 0, "JSONL_EMPTY");
  return content.split(/\r?\n/).map((line) => JSON.parse(line));
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  if (percentileValue === 0.5 && sorted.length % 2 === 0) {
    const middle = sorted.length / 2;
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function countFailureCodes(rows) {
  const counts = {};
  for (const code of rows.flatMap((row) => row.failureCodes ?? [])) {
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

const config = await readJson(paths.config);
const bundle = await readJson(paths.bundle);
const localSummary = await readJson(paths.localSummary);
const localRows = await readJsonl(paths.localResults);
const marker = await readJson(paths.marker);
const hostedEvidence = await readJson(paths.hosted);
const cascadeMock = await readJson(paths.cascadeMock);
const priorComparison =
  experimentVersion === "v2"
    ? await readJson(paths.priorComparison)
    : undefined;
const hashes = {
  config: await sha256(paths.config),
  bundle: await sha256(paths.bundle),
  localSummary: await sha256(paths.localSummary),
  localResults: await sha256(paths.localResults),
  marker: await sha256(paths.marker),
  hosted: await sha256(paths.hosted),
  cascadeMock: await sha256(paths.cascadeMock),
  ...(experimentVersion === "v2"
    ? { priorComparison: await sha256(paths.priorComparison) }
    : {}),
};

requireValue(hashes.bundle === config.bundleSha256, "BUNDLE_HASH");
requireValue(hashes.hosted === config.hostedReference.sha256, "HOSTED_HASH");
requireValue(localSummary.bundleSha256 === hashes.bundle, "LOCAL_BUNDLE_HASH");
requireValue(localSummary.configSha256 === hashes.config, "LOCAL_CONFIG_HASH");
requireValue(
  localSummary.status ===
    (experimentVersion === "v1"
      ? "LOCAL_COMPARISON_FAIL"
      : "LOCAL_COMPARISON_PASS"),
  "LOCAL_STATUS",
);
requireValue(localSummary.taskCount === 12, "LOCAL_SUMMARY_TASK_COUNT");
requireValue(localSummary.frozenRecordsRead === 0, "LOCAL_FROZEN_READ");
requireValue(localSummary.evaluationAttempts === 1, "LOCAL_ATTEMPT_COUNT");
requireValue(localSummary.rerunPermitted === false, "LOCAL_RERUN_BOUNDARY");
requireValue(localSummary.productIntegrationApproved === false, "LOCAL_PRODUCT_BOUNDARY");
requireValue(marker.terminalAttempt === true, "MARKER_TERMINAL_ATTEMPT");
requireValue(marker.rerunPermitted === false, "MARKER_RERUN_BOUNDARY");
requireValue(marker.configSha256 === hashes.config, "MARKER_CONFIG_HASH");
requireValue(marker.bundleSha256 === hashes.bundle, "MARKER_BUNDLE_HASH");
requireValue(
  Date.parse(marker.startedAt) <= Date.parse(localSummary.capturedAt),
  "MARKER_TIME_ORDER",
);

requireValue(localRows.length === 12, "LOCAL_RESULT_COUNT");
requireValue(bundle.records.length === 12, "BUNDLE_RECORD_COUNT");
const bundleById = new Map(bundle.records.map((record) => [record.recordId, record]));
for (const row of localRows) {
  requireValue(
    sameJson(Object.keys(row).sort(), localResultKeys),
    `LOCAL_RESULT_FIELDS_${row.taskId}`,
  );
  const record = bundleById.get(row.taskId);
  requireValue(record, `LOCAL_UNKNOWN_TASK_${row.taskId}`);
  requireValue(row.role === record.role, `LOCAL_ROLE_${row.taskId}`);
  requireValue(
    row.containsUntrustedInstruction === record.containsUntrustedInstruction,
    `LOCAL_INJECTION_FLAG_${row.taskId}`,
  );
  requireValue(
    ["PASSED", "SAFE_FALLBACK"].includes(row.status),
    `LOCAL_STATUS_${row.taskId}`,
  );
  requireValue(/^[a-f0-9]{64}$/.test(row.outputSha256), `LOCAL_OUTPUT_HASH_${row.taskId}`);
  requireValue(row.unsafeDisplayCount === 0, `LOCAL_UNSAFE_${row.taskId}`);
}

const hostedRun = hostedEvidence.run;
const hostedProvider = hostedRun.providers.find(
  (provider) =>
    provider.providerId === config.hostedReference.providerId &&
    provider.model === config.hostedReference.model,
);
requireValue(hostedEvidence.status === "COMPLETED", "HOSTED_STATUS");
requireValue(hostedProvider?.providerMode === "LIVE", "HOSTED_MODE");
requireValue(hostedProvider?.taskCount === 12, "HOSTED_TASK_COUNT");
requireValue(hostedProvider.metrics.passed === 12, "HOSTED_PASS_COUNT");
requireValue(hostedProvider.metrics.unsafeDisplayCount === 0, "HOSTED_UNSAFE");
const hostedById = new Map(
  hostedProvider.results.map((result) => [result.taskId, result]),
);
requireValue(
  sameJson(
    hostedProvider.results.map((result) => result.taskId),
    bundle.records.map((record) => record.recordId),
  ),
  "SAME_TASK_ORDER",
);

const comparisonRows = localRows.map((local) => {
  const hosted = hostedById.get(local.taskId);
  requireValue(hosted?.status === "PASSED", `HOSTED_TASK_${local.taskId}`);
  const escalated = local.status !== "PASSED";
  return {
    taskId: local.taskId,
    role: local.role,
    localStatus: local.status,
    localFailureCodes: local.failureCodes,
    cascadeSelectedProvider: escalated ? "AX" : "AX_LOCAL",
    escalated,
    attemptCount: escalated ? 2 : 1,
    finalStatus: "PASSED",
    sequentialLatencyMs: local.generationMs + (escalated ? hosted.latencyMs : 0),
    promptTokens: local.promptTokens + (escalated ? (hosted.usage.promptTokens ?? 0) : 0),
    completionTokens:
      local.completionTokens + (escalated ? (hosted.usage.completionTokens ?? 0) : 0),
    unsafeDisplayCount: 0,
  };
});

const localLatencies = localRows.map((row) => row.generationMs);
const hostedLatencies = hostedProvider.results.map((row) => row.latencyMs);
const cascadeLatencies = comparisonRows.map((row) => row.sequentialLatencyMs);
const localPassed = localRows.filter((row) => row.status === "PASSED").length;
const escalated = comparisonRows.filter((row) => row.escalated).length;
const localGatePassed = localPassed === 12;
const metrics = [
  {
    strategy: "LOCAL_ONLY",
    taskCount: 12,
    verifiedLocal: localPassed,
    verifiedHosted: 0,
    fallback: 12 - localPassed,
    escalated: 0,
    finalVerifiedRate: localPassed / 12,
    latencyMsP50: percentile(localLatencies, 0.5),
    latencyMsP95: percentile(localLatencies, 0.95),
    promptTokens: sum(localRows, "promptTokens"),
    completionTokens: sum(localRows, "completionTokens"),
    totalTokens: sum(localRows, "promptTokens") + sum(localRows, "completionTokens"),
    unsafeDisplayCount: 0,
    failureCodes: countFailureCodes(localRows),
  },
  {
    strategy: "HOSTED_ONLY",
    taskCount: 12,
    verifiedLocal: 0,
    verifiedHosted: 12,
    fallback: 0,
    escalated: 0,
    finalVerifiedRate: 1,
    latencyMsP50: percentile(hostedLatencies, 0.5),
    latencyMsP95: percentile(hostedLatencies, 0.95),
    promptTokens: hostedProvider.metrics.promptTokens,
    completionTokens: hostedProvider.metrics.completionTokens,
    totalTokens: hostedProvider.metrics.totalTokens,
    unsafeDisplayCount: 0,
    failureCodes: {},
  },
  {
    strategy: "CASCADE",
    taskCount: 12,
    verifiedLocal: localPassed,
    verifiedHosted: escalated,
    fallback: 0,
    escalated,
    finalVerifiedRate: 1,
    latencyMsP50: percentile(cascadeLatencies, 0.5),
    latencyMsP95: percentile(cascadeLatencies, 0.95),
    promptTokens: sum(comparisonRows, "promptTokens"),
    completionTokens: sum(comparisonRows, "completionTokens"),
    totalTokens:
      sum(comparisonRows, "promptTokens") +
      sum(comparisonRows, "completionTokens"),
    unsafeDisplayCount: 0,
    escalationReasons: countFailureCodes(
      localRows.filter((row) => row.status === "SAFE_FALLBACK"),
    ),
  },
];

const mockCascade = cascadeMock.metrics.find(
  (metric) => metric.strategy === "CASCADE",
);
requireValue(mockCascade?.finalVerifiedRate === 1, "CASCADE_MOCK_FINAL_RATE");
requireValue(mockCascade?.unsafeDisplayCount === 0, "CASCADE_MOCK_UNSAFE");

const priorLocalMetric = priorComparison?.metrics?.find(
  (metric) => metric.strategy === "LOCAL_ONLY",
);
if (experimentVersion === "v2") {
  requireValue(
    priorComparison?.experimentId === "ax-cascade-product-review-v1",
    "PRIOR_COMPARISON_EXPERIMENT",
  );
  requireValue(
    priorComparison?.taskSuite === bundle.sourceTaskSuite,
    "PRIOR_COMPARISON_TASK_SUITE",
  );
  requireValue(priorLocalMetric?.verifiedLocal === 7, "PRIOR_LOCAL_PASS_COUNT");
  requireValue(localGatePassed, "V2_LOCAL_GATE");
}

const recommendation =
  experimentVersion === "v1"
    ? "DEFER_LOCAL_PRODUCT_ACTIVATION"
    : "QUALIFY_LOCAL_MODEL_RETAIN_ACTIVATION_REVIEW";

const artifact = {
  schemaVersion: "ax-cascade-product-review-comparison-v1",
  capturedAt: localSummary.capturedAt,
  status: localGatePassed
    ? "CASCADE_COMPARISON_PASS_LOCAL_QUALIFIED"
    : "CASCADE_COMPARISON_PASS_LOCAL_NOT_QUALIFIED",
  experimentId: config.experimentId,
  taskSuite: bundle.sourceTaskSuite,
  taskCountPerStrategy: 12,
  evidenceMode: "RECORDED_SAME_TASK_COMPARISON",
  evidenceHashes: hashes,
  ...(experimentVersion === "v2"
    ? {
        improvementFromV1: {
          sameTaskSuite: true,
          priorExperimentId: priorComparison.experimentId,
          priorVerifiedLocal: priorLocalMetric.verifiedLocal,
          currentVerifiedLocal: localPassed,
          verifiedLocalDelta: localPassed - priorLocalMetric.verifiedLocal,
          priorFallback: priorLocalMetric.fallback,
          currentFallback: 12 - localPassed,
          fallbackDelta: 12 - localPassed - priorLocalMetric.fallback,
          priorFinalVerifiedRate:
            priorComparison.metrics.find(
              (metric) => metric.strategy === "LOCAL_ONLY",
            ).finalVerifiedRate,
          currentFinalVerifiedRate: localPassed / 12,
        },
      }
    : {}),
  results: comparisonRows,
  metrics,
  gates: {
    sameTaskOrderVerified: true,
    localGatePassed,
    hostedReferencePassed: true,
    cascadeFinalVerifiedRateMinimum: 1,
    cascadeUnsafeDisplayCountMaximum: 0,
    cascadeGatePassed: true,
    frozenRecordsRead: 0,
    localEvaluationAttempts: 1,
    localRerunPermitted: false,
  },
  controlledFailureEvidence: {
    path: path.relative(root, paths.cascadeMock).replaceAll("\\", "/"),
    sha256: hashes.cascadeMock,
    cascadeVerified: mockCascade.verifiedLocal + mockCascade.verifiedHosted,
    cascadeFallback: mockCascade.fallback,
    unsafeDisplayCount: mockCascade.unsafeDisplayCount,
  },
  humanReview: {
    recommendation,
    cascadeContractQualified: true,
    localProductSlotQualified: localGatePassed,
    runtimeActivationReady: false,
    reasons:
      experimentVersion === "v1"
        ? [
            "LOCAL_GATE_FAILED_7_OF_12",
            "HOSTED_ESCALATION_REQUIRED_5_OF_12",
            "CASCADE_P95_EXCEEDS_HOSTED_ONLY",
            "LOCAL_PRODUCTION_RUNTIME_NOT_DEPLOYED",
          ]
        : [
            "LOCAL_GATE_PASSED_12_OF_12",
            "LOCAL_P95_EXCEEDS_HOSTED_ONLY",
            "LOCAL_PRODUCTION_RUNTIME_NOT_DEPLOYED",
            "PRODUCT_ACTIVATION_REQUIRES_USER_APPROVAL",
          ],
  },
  privacy: {
    promptStored: false,
    rawOutputStored: false,
    actualPersonalDataCount: 0,
  },
  productIntegrationApproved: false,
  nextGate: localGatePassed
    ? "controlled-runtime-and-human-activation-decision"
    : "human-product-review-decision",
};

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (checkOnly) {
  requireValue((await readFile(paths.output, "utf8")) === serialized, "ARTIFACT_DRIFT");
} else {
  await writeFile(paths.output, serialized, "utf8");
}
console.log(
  `AX_CASCADE_PRODUCT_REVIEW_ASSEMBLY_PASS local=${localPassed}/12 ` +
    `hosted=12/12 cascade=12/12 escalated=${escalated} fallback=0 unsafe=0 ` +
    `recommendation=${artifact.humanReview.recommendation} write=${checkOnly ? "false" : "true"}`,
);
if (!checkOnly) console.log(`artifact=${paths.output}`);
