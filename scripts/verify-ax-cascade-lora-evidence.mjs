#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const evidenceRoot = path.join(
  root,
  "artifacts/evals/local-model-runs/ax-cascade-lora-v1",
);
const paths = {
  trainingConfig: path.join(root, "config/a100-cascade-lora-v1.json"),
  frozenConfig: path.join(root, "config/a100-cascade-lora-frozen-v1.json"),
  datasetManifest: path.join(
    root,
    "data/manifests/synthetic-cascade-explanations-v1.json",
  ),
  trainingSummary: path.join(evidenceRoot, "training-summary.json"),
  consumptionMarker: path.join(
    evidenceRoot,
    "frozen-evaluation-consumed.json",
  ),
  validationSummary: path.join(
    evidenceRoot,
    "ax-cascade-lora-v1-validation-run1/validation-summary.json",
  ),
  validationResults: path.join(
    evidenceRoot,
    "ax-cascade-lora-v1-validation-run1/validation-results.jsonl",
  ),
  frozenSummary: path.join(
    evidenceRoot,
    "ax-cascade-lora-v1-frozen-run1/frozen-summary.json",
  ),
  frozenResults: path.join(
    evidenceRoot,
    "ax-cascade-lora-v1-frozen-run1/frozen-results.jsonl",
  ),
  output: path.join(
    root,
    "artifacts/evals/ax-cascade-lora-evidence-latest.json",
  ),
};

const resultKeys = [
  "recordId",
  "parentRecordId",
  "role",
  "scenarioFamily",
  "containsUntrustedInstruction",
  "status",
  "schemaValid",
  "numericIntegrityValid",
  "citationIntegrityValid",
  "rolePolicyValid",
  "injectionIsolationValid",
  "exactContractMatch",
  "failureCodes",
  "outputSha256",
  "promptTokens",
  "completionTokens",
  "generationMs",
  "unsafeDisplayCount",
].sort();

function fail(code) {
  throw new Error(`AX_CASCADE_LORA_EVIDENCE_VERIFY_FAILED code=${code}`);
}

function requireValue(condition, code) {
  if (!condition) fail(code);
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function readJson(filePath) {
  const value = JSON.parse(await readFile(filePath, "utf8"));
  requireValue(value && typeof value === "object" && !Array.isArray(value), "JSON_OBJECT_REQUIRED");
  return value;
}

async function readJsonl(filePath) {
  const content = (await readFile(filePath, "utf8")).trim();
  requireValue(content.length > 0, "JSONL_EMPTY");
  return content.split(/\r?\n/).map((line, index) => {
    try {
      const value = JSON.parse(line);
      requireValue(value && typeof value === "object" && !Array.isArray(value), "JSONL_OBJECT_REQUIRED");
      return value;
    } catch (error) {
      fail(`JSONL_PARSE line=${index + 1} cause=${error.message}`);
    }
  });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function approximately(left, right, tolerance = 1e-9) {
  return typeof left === "number" && Math.abs(left - right) <= tolerance;
}

function aggregate(rows) {
  const schemaValid = rows.filter((row) => row.schemaValid === true);
  const injection = rows.filter(
    (row) => row.containsUntrustedInstruction === true,
  );
  const failureCodes = {};
  for (const row of rows) {
    for (const code of row.failureCodes) {
      failureCodes[code] = (failureCodes[code] ?? 0) + 1;
    }
  }
  const latencies = rows.map((row) => row.generationMs).sort((a, b) => a - b);
  const middle = Math.floor(latencies.length / 2);
  const p50 =
    latencies.length % 2 === 0
      ? (latencies[middle - 1] + latencies[middle]) / 2
      : latencies[middle];
  const p95 = latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)];
  return {
    verified: rows.filter((row) => row.status === "VERIFIED").length,
    safeFallback: rows.filter((row) => row.status === "SAFE_FALLBACK").length,
    schemaPassRate: rate(schemaValid.length, rows.length),
    numericIntegrityRateAmongSchemaValid: rate(
      schemaValid.filter((row) => row.numericIntegrityValid === true).length,
      schemaValid.length,
    ),
    citationIntegrityRateAmongSchemaValid: rate(
      schemaValid.filter((row) => row.citationIntegrityValid === true).length,
      schemaValid.length,
    ),
    rolePolicyRateAmongSchemaValid: rate(
      schemaValid.filter((row) => row.rolePolicyValid === true).length,
      schemaValid.length,
    ),
    injectionIsolationRate: rate(
      injection.filter((row) => row.injectionIsolationValid === true).length,
      injection.length,
    ),
    exactContractMatchRate: rate(
      rows.filter((row) => row.exactContractMatch === true).length,
      rows.length,
    ),
    generationLatencyMsP50: p50,
    generationLatencyMsP95: p95,
    promptTokensTotal: rows.reduce((total, row) => total + row.promptTokens, 0),
    completionTokensTotal: rows.reduce(
      (total, row) => total + row.completionTokens,
      0,
    ),
    unsafeDisplayCount: rows.reduce(
      (total, row) => total + row.unsafeDisplayCount,
      0,
    ),
    failureCodes,
  };
}

function verifyRows(rows, sourceRecords, split) {
  requireValue(rows.length === 200, `${split}_RESULT_COUNT`);
  requireValue(sourceRecords.length === 200, `${split}_SOURCE_COUNT`);
  requireValue(
    new Set(rows.map((row) => row.recordId)).size === rows.length,
    `${split}_DUPLICATE_RESULT_ID`,
  );
  const sourceById = new Map(
    sourceRecords.map((record) => [record.recordId, record]),
  );
  for (const row of rows) {
    requireValue(
      sameJson(Object.keys(row).sort(), resultKeys),
      `${split}_RESULT_FIELDS`,
    );
    const source = sourceById.get(row.recordId);
    requireValue(source, `${split}_UNKNOWN_RECORD_ID`);
    requireValue(source.split === split, `${split}_SOURCE_SPLIT`);
    for (const key of [
      "parentRecordId",
      "role",
      "scenarioFamily",
      "containsUntrustedInstruction",
    ]) {
      requireValue(row[key] === source[key], `${split}_METADATA_${key}`);
    }
    requireValue(row.status === "VERIFIED", `${split}_NON_VERIFIED_STATUS`);
    for (const key of [
      "schemaValid",
      "numericIntegrityValid",
      "citationIntegrityValid",
      "rolePolicyValid",
      "injectionIsolationValid",
      "exactContractMatch",
    ]) {
      requireValue(row[key] === true, `${split}_FAILED_${key}`);
    }
    requireValue(
      Array.isArray(row.failureCodes) && row.failureCodes.length === 0,
      `${split}_FAILURE_CODES`,
    );
    requireValue(
      /^[a-f0-9]{64}$/.test(row.outputSha256),
      `${split}_OUTPUT_HASH`,
    );
    requireValue(
      Number.isInteger(row.promptTokens) && row.promptTokens > 0,
      `${split}_PROMPT_TOKENS`,
    );
    requireValue(
      Number.isInteger(row.completionTokens) && row.completionTokens > 0,
      `${split}_COMPLETION_TOKENS`,
    );
    requireValue(
      typeof row.generationMs === "number" && row.generationMs > 0,
      `${split}_GENERATION_MS`,
    );
    requireValue(row.unsafeDisplayCount === 0, `${split}_UNSAFE_DISPLAY`);
  }
}

function verifySummaryMetrics(summary, metrics, includeLatency) {
  for (const key of [
    "verified",
    "safeFallback",
    "unsafeDisplayCount",
    "failureCodes",
  ]) {
    requireValue(sameJson(summary.metrics[key], metrics[key]), `SUMMARY_METRIC_${key}`);
  }
  for (const key of [
    "schemaPassRate",
    "numericIntegrityRateAmongSchemaValid",
    "citationIntegrityRateAmongSchemaValid",
    "rolePolicyRateAmongSchemaValid",
    "injectionIsolationRate",
    "exactContractMatchRate",
  ]) {
    requireValue(approximately(summary.metrics[key], metrics[key]), `SUMMARY_RATE_${key}`);
  }
  if (includeLatency) {
    for (const key of [
      "generationLatencyMsP50",
      "generationLatencyMsP95",
      "promptTokensTotal",
      "completionTokensTotal",
    ]) {
      requireValue(approximately(summary.metrics[key], metrics[key]), `SUMMARY_AGGREGATE_${key}`);
    }
  }
}

const trainingConfig = await readJson(paths.trainingConfig);
const frozenConfig = await readJson(paths.frozenConfig);
const datasetManifest = await readJson(paths.datasetManifest);
const trainingSummary = await readJson(paths.trainingSummary);
const marker = await readJson(paths.consumptionMarker);
const validationSummary = await readJson(paths.validationSummary);
const frozenSummary = await readJson(paths.frozenSummary);
const validationRows = await readJsonl(paths.validationResults);
const frozenRows = await readJsonl(paths.frozenResults);

const validationSourcePath = path.join(root, trainingConfig.dataset.validationSplit);
const frozenSourcePath = path.join(root, trainingConfig.dataset.frozenSplit);
const validationSource = await readJsonl(validationSourcePath);
const frozenSource = await readJsonl(frozenSourcePath);
const hashes = {
  trainingConfig: await sha256(paths.trainingConfig),
  frozenConfig: await sha256(paths.frozenConfig),
  datasetManifest: await sha256(paths.datasetManifest),
  trainingSummary: await sha256(paths.trainingSummary),
  consumptionMarker: await sha256(paths.consumptionMarker),
  validationSummary: await sha256(paths.validationSummary),
  validationResults: await sha256(paths.validationResults),
  frozenSummary: await sha256(paths.frozenSummary),
  frozenResults: await sha256(paths.frozenResults),
  validationSource: await sha256(validationSourcePath),
  frozenSource: await sha256(frozenSourcePath),
};

requireValue(hashes.trainingConfig === frozenConfig.trainingConfigSha256, "TRAINING_CONFIG_HASH");
requireValue(hashes.datasetManifest === trainingConfig.dataset.manifestSha256, "DATASET_MANIFEST_HASH");
for (const [label, value] of [
  ["training", trainingSummary],
  ["validation", validationSummary],
  ["frozen", frozenSummary],
  ["marker", marker],
]) {
  requireValue(
    value.experimentId === trainingConfig.experimentId,
    `${label.toUpperCase()}_EXPERIMENT_ID`,
  );
}
requireValue(trainingSummary.status === "TRAINED_NOT_QUALIFIED", "TRAINING_STATUS");
requireValue(trainingSummary.frozenRecordsRead === 0, "TRAINING_FROZEN_READ");
requireValue(trainingSummary.productIntegrationApproved === false, "TRAINING_PRODUCT_BOUNDARY");
requireValue(sameJson(trainingSummary.baseModel, trainingConfig.baseModel), "TRAINING_BASE_MODEL");
requireValue(trainingSummary.datasetVersion === trainingConfig.dataset.version, "TRAINING_DATASET_VERSION");
requireValue(trainingSummary.datasetManifestSha256 === hashes.datasetManifest, "TRAINING_DATASET_HASH");
requireValue(validationSummary.status === "VALIDATION_GATE_PASS", "VALIDATION_STATUS");
requireValue(validationSummary.taskCount === 200, "VALIDATION_TASK_COUNT");
requireValue(validationSummary.frozenRecordsRead === 0, "VALIDATION_FROZEN_READ");
requireValue(validationSummary.trainingConfigSha256 === hashes.trainingConfig, "VALIDATION_CONFIG_HASH");
requireValue(validationSummary.trainingSummarySha256 === hashes.trainingSummary, "VALIDATION_TRAINING_HASH");
requireValue(validationSummary.productIntegrationApproved === false, "VALIDATION_PRODUCT_BOUNDARY");
requireValue(validationSummary.nextGate === "single-frozen-evaluation", "VALIDATION_NEXT_GATE");
requireValue(sameJson(validationSummary.baseModel, trainingConfig.baseModel), "VALIDATION_BASE_MODEL");
requireValue(validationSummary.datasetVersion === trainingConfig.dataset.version, "VALIDATION_DATASET_VERSION");
requireValue(
  sameJson(validationSummary.qualificationGate, trainingConfig.qualificationGate),
  "VALIDATION_QUALIFICATION_GATE",
);
requireValue(frozenSummary.status === "FROZEN_GATE_PASS", "FROZEN_STATUS");
requireValue(frozenSummary.taskCount === 200, "FROZEN_TASK_COUNT");
requireValue(frozenSummary.frozenRecordsRead === 200, "FROZEN_READ_COUNT");
requireValue(frozenSummary.frozenEvaluationAttempts === 1, "FROZEN_ATTEMPT_COUNT");
requireValue(frozenSummary.rerunPermitted === false, "FROZEN_RERUN_BOUNDARY");
requireValue(frozenSummary.trainingConfigSha256 === hashes.trainingConfig, "FROZEN_CONFIG_HASH");
requireValue(frozenSummary.frozenConfigSha256 === hashes.frozenConfig, "FROZEN_GATE_CONFIG_HASH");
requireValue(frozenSummary.trainingSummarySha256 === hashes.trainingSummary, "FROZEN_TRAINING_HASH");
requireValue(frozenSummary.validationSummarySha256 === hashes.validationSummary, "FROZEN_VALIDATION_HASH");
requireValue(frozenSummary.productIntegrationApproved === false, "FROZEN_PRODUCT_BOUNDARY");
requireValue(
  frozenSummary.nextGate === "independent-cascade-comparison-and-product-review",
  "FROZEN_NEXT_GATE",
);
requireValue(sameJson(frozenSummary.baseModel, trainingConfig.baseModel), "FROZEN_BASE_MODEL");
requireValue(frozenSummary.datasetVersion === trainingConfig.dataset.version, "FROZEN_DATASET_VERSION");
requireValue(
  sameJson(frozenSummary.qualificationGate, frozenConfig.frozenGate),
  "FROZEN_QUALIFICATION_GATE",
);
requireValue(
  sameJson(frozenSummary.generation, frozenConfig.generation),
  "FROZEN_GENERATION_CONFIG",
);
requireValue(sameJson(validationSummary.adapter, frozenSummary.adapter), "ADAPTER_MANIFEST_MISMATCH");
requireValue(
  validationSummary.adapter.files.every(
    (file) =>
      typeof file.path === "string" &&
      !path.isAbsolute(file.path) &&
      Number.isInteger(file.bytes) &&
      file.bytes > 0 &&
      /^[a-f0-9]{64}$/.test(file.sha256),
  ),
  "ADAPTER_FILE_MANIFEST",
);
requireValue(marker.terminalAttempt === true, "MARKER_TERMINAL_ATTEMPT");
requireValue(marker.rerunPermitted === false, "MARKER_RERUN_BOUNDARY");
requireValue(marker.validationSummarySha256 === hashes.validationSummary, "MARKER_VALIDATION_HASH");
requireValue(marker.frozenConfigSha256 === hashes.frozenConfig, "MARKER_CONFIG_HASH");
requireValue(
  Date.parse(marker.startedAt) <= Date.parse(frozenSummary.capturedAt),
  "MARKER_TIME_ORDER",
);

const validationManifestEntry = datasetManifest.files.find(
  (entry) => entry.split === "validation",
);
const frozenManifestEntry = datasetManifest.files.find(
  (entry) => entry.split === "frozen-test",
);
requireValue(validationManifestEntry?.sha256 === hashes.validationSource, "VALIDATION_SOURCE_HASH");
requireValue(frozenManifestEntry?.sha256 === hashes.frozenSource, "FROZEN_SOURCE_HASH");
requireValue(validationSummary.validationFileSha256 === hashes.validationSource, "VALIDATION_SUMMARY_SOURCE_HASH");
requireValue(frozenSummary.frozenFileSha256 === hashes.frozenSource, "FROZEN_SUMMARY_SOURCE_HASH");

verifyRows(validationRows, validationSource, "validation");
verifyRows(frozenRows, frozenSource, "frozen-test");
const validationMetrics = aggregate(validationRows);
const frozenMetrics = aggregate(frozenRows);
verifySummaryMetrics(validationSummary, validationMetrics, false);
verifySummaryMetrics(frozenSummary, frozenMetrics, true);

const artifact = {
  schemaVersion: "ax-cascade-lora-evidence-verification-v1",
  capturedAt: new Date().toISOString(),
  status: "VERIFIED",
  experimentId: trainingConfig.experimentId,
  terminalEvaluatorCommit: "361fde02af15c4fb8ea106991c9a34f3b14b088d",
  evidenceHashes: Object.fromEntries(
    Object.entries(hashes)
      .filter(([key]) => !["validationSource", "frozenSource"].includes(key))
      .map(([key, value]) => [key, value]),
  ),
  dataset: {
    version: trainingConfig.dataset.version,
    manifestSha256: hashes.datasetManifest,
    validationFileSha256: hashes.validationSource,
    frozenFileSha256: hashes.frozenSource,
  },
  training: {
    status: trainingSummary.status,
    trainRecords: trainingSummary.trainRecords,
    validationRecords: trainingSummary.validationRecords,
    frozenRecordsRead: trainingSummary.frozenRecordsRead,
  },
  validation: {
    status: validationSummary.status,
    taskCount: validationRows.length,
    metrics: validationMetrics,
    frozenRecordsRead: validationSummary.frozenRecordsRead,
  },
  frozen: {
    status: frozenSummary.status,
    taskCount: frozenRows.length,
    metrics: frozenMetrics,
    evaluationSeconds: frozenSummary.metrics.evaluationSeconds,
    peakCudaMemoryMiB: frozenSummary.metrics.peakCudaMemoryMiB,
    frozenRecordsRead: frozenSummary.frozenRecordsRead,
    frozenEvaluationAttempts: frozenSummary.frozenEvaluationAttempts,
    rerunPermitted: frozenSummary.rerunPermitted,
  },
  privacy: {
    promptStored: false,
    rawOutputStored: false,
    actualPersonalDataCount: 0,
  },
  productIntegrationApproved: false,
  nextGate: "independent-cascade-comparison-and-product-review",
};

if (!checkOnly) {
  await writeFile(paths.output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}
console.log(
  `AX_CASCADE_LORA_EVIDENCE_VERIFY_PASS validation=${validationRows.length}/200 ` +
    `frozen=${frozenRows.length}/200 unsafe=${frozenMetrics.unsafeDisplayCount} ` +
    `rerun=${frozenSummary.rerunPermitted} write=${checkOnly ? "false" : "true"}`,
);
if (!checkOnly) console.log(`artifact=${paths.output}`);
