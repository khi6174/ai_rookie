import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const outputDirectory = resolve(root, "artifacts/evals");
const capturedAt = new Date().toISOString();
const latestPath = resolve(outputDirectory, "final-readiness-latest.json");
const immutableDirectory = resolve(
  outputDirectory,
  "final-readiness-runs",
  capturedAt.replaceAll(/[^0-9A-Za-z]/g, "-"),
);
const pnpmEntry = process.env.npm_execpath;

if (!pnpmEntry) {
  throw new Error("pnpm entry point is not available");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runPnpm(id, args, successPattern, timeoutMs = 180_000) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [pnpmEntry, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    env: process.env,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const passed = result.status === 0 && successPattern.test(output);
  return {
    id,
    command: `pnpm ${args.join(" ")}`,
    passed,
    exitCode: result.status,
    signal: result.signal,
    elapsedMs: Date.now() - startedAt,
    outputSha256: sha256(output),
    evidenceLine:
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .find((line) => successPattern.test(line)) ?? null,
  };
}

async function readJson(fileName) {
  return JSON.parse(await readFile(resolve(outputDirectory, fileName), "utf8"));
}

function check(id, passed, details) {
  return { id, passed, details };
}

const commands = [
  runPnpm("BUILD", ["run", "build"], /built in/i),
  runPnpm("PLAYWRIGHT_E2E", ["run", "test:e2e"], /9 passed/),
  runPnpm(
    "CLEAN_START_3X",
    ["run", "test:e2e:clean-start"],
    /CLEAN_START_3X_PASS/,
  ),
  runPnpm(
    "DOMESTIC_TRACK_AUDIT",
    ["run", "eval:domestic-track:audit"],
    /DOMESTIC_TRACK_AUDIT_PASS/,
  ),
  runPnpm(
    "CORE_EVIDENCE",
    ["run", "eval:core-artifacts"],
    /CORE_EVAL_ARTIFACTS_PASS/,
  ),
];

const requiredApprovedDocuments = [
  "docs/product-spec.md",
  "docs/data-contracts.md",
  "docs/safety-model.md",
  "docs/intervention-policy.md",
  "docs/privacy-and-ai-policy.md",
  "docs/design-system.md",
  "docs/architecture.md",
  "docs/evals.md",
  "docs/demo-script.md",
  "docs/decisions.md",
  "docs/domestic-ai-track-compliance.md",
  "docs/final-readiness.md",
];
const documentStatuses = [];
for (const file of requiredApprovedDocuments) {
  const text = await readFile(resolve(root, file), "utf8");
  const status = text.match(/^- 상태:\s*(.+)$/m)?.[1]?.trim() ?? "MISSING";
  documentStatuses.push({ file, status, approved: status.startsWith("Approved") });
}

const unit = await readJson("unit-summary.json");
const accessibility = await readJson("accessibility-summary.json");
const frozen = await readJson("frozen-benchmark-summary.json");
const riskTransfer = await readJson("risk-transfer-boundary-summary.json");
const decisionWorkflow = await readJson(
  "decision-workflow-boundary-summary.json",
);
const domesticTrack = await readJson("domestic-track-compliance-latest.json");
const weather = await readJson("weather-runtime-selection-latest.json");
const coreManifest = await readJson("run-manifest.json");
const safeRouteStrategy = frozen.strategies.find(
  (strategy) => strategy.strategy === "SAFEROUTE",
);

const evidenceChecks = [
  check(
    "APPROVED_DOCUMENTS",
    documentStatuses.every((document) => document.approved),
    `${documentStatuses.filter((document) => document.approved).length}/${documentStatuses.length} approved`,
  ),
  check(
    "UNIT_TESTS",
    unit.success && unit.failed === 0 && unit.testCount >= 182,
    `${unit.passed}/${unit.testCount} passed`,
  ),
  check(
    "ACCESSIBILITY_VIEWPORTS",
    accessibility.passed && accessibility.checks.length === 6,
    `${accessibility.checks.filter((item) => item.passed).length}/${accessibility.checks.length} checks passed`,
  ),
  check(
    "FROZEN_STRATEGY_COMPARISON",
    frozen.comparisonCount === 90 &&
      frozen.allSafeRouteSelectionsRespectHardConstraints === true &&
      safeRouteStrategy?.hardConstraintViolationCount === 0,
    `${frozen.comparisonCount} comparisons, SafeRoute violations=${safeRouteStrategy?.hardConstraintViolationCount}`,
  ),
  check(
    "RISK_TRANSFER_BOUNDARIES",
    riskTransfer.allPassed && riskTransfer.totalCaseCount === 23,
    `${riskTransfer.passedCount}/${riskTransfer.totalCaseCount} passed`,
  ),
  check(
    "DECISION_WORKFLOW_BOUNDARIES",
    decisionWorkflow.allPassed && decisionWorkflow.caseCount === 30,
    `${decisionWorkflow.passedCount}/${decisionWorkflow.caseCount} passed`,
  ),
  check(
    "DOMESTIC_AI_TRACK",
    domesticTrack.status === "PASSED" &&
      domesticTrack.checks.every((item) => item.passed),
    `${domesticTrack.checks.filter((item) => item.passed).length}/${domesticTrack.checks.length} passed`,
  ),
  check(
    "WEATHER_FALLBACK_INTEGRITY",
    weather.status === "FALLBACK" &&
      weather.audit.liveEvidenceUsedForSafety === false &&
      weather.audit.mixedLiveAndDemoFields === false,
    `${weather.displayLabel}, mixed=${weather.audit.mixedLiveAndDemoFields}`,
  ),
  check(
    "CORE_MANIFEST",
    coreManifest.artifacts.length === 13 &&
      coreManifest.credentialsStored === false &&
      coreManifest.rawApiResponsesStored === false,
    `${coreManifest.artifacts.length} artifacts, credentialsStored=${coreManifest.credentialsStored}`,
  ),
];

const commandChecksPassed = commands.every((command) => command.passed);
const evidenceChecksPassed = evidenceChecks.every((item) => item.passed);
const result = {
  schemaVersion: "final-readiness-audit-v1",
  capturedAt,
  status: commandChecksPassed && evidenceChecksPassed ? "PASSED" : "FAILED",
  releaseScope: "AI_ROOKIE_DOMESTIC_TRACK_FINALS_DEMO",
  dataClassification:
    "synthetic Demo fixtures, public weather evidence, and redacted AI evaluation summaries",
  commands,
  documentStatuses,
  evidenceChecks,
  summary: {
    unitTests: unit.testCount,
    e2eTests: 9,
    cleanStartRuns: 3,
    requiredViewports: 4,
    screenshotAndAccessibilityChecks: accessibility.checks.length,
    frozenVariants: frozen.variantCount,
    strategyComparisons: frozen.comparisonCount,
    safeRouteHardConstraintViolations:
      safeRouteStrategy?.hardConstraintViolationCount,
    riskTransferBoundaries: riskTransfer.totalCaseCount,
    decisionWorkflowBoundaries: decisionWorkflow.caseCount,
    domesticTrackChecks: domesticTrack.checks.length,
    coreArtifacts: coreManifest.artifacts.length,
  },
  explicitLimitations: [
    "Finals Demo readiness is not production deployment approval.",
    "No real courier or customer personal data is processed.",
    "No real TMS, map provider, authentication, or customer message delivery is integrated.",
    "A.X K1 API Live benchmark is not claimed until a valid account key and quota are verified.",
    "Synthetic simulation results are not evidence of real accident reduction.",
  ],
  remainingHumanChecks: [
    "Run on the actual presentation PC at 1280x720 and browser zoom 100%.",
    "Assign presenter and recovery operator roles.",
    "Confirm the exact submission form, video filename, and organizer upload deadline.",
    "Record the final GitHub commit SHA in the submitted materials.",
  ],
};

await mkdir(outputDirectory, { recursive: true });
await mkdir(resolve(outputDirectory, "final-readiness-runs"), {
  recursive: true,
});
await mkdir(immutableDirectory, { recursive: false });
const serialized = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(latestPath, serialized, "utf8");
await writeFile(
  resolve(immutableDirectory, "final-readiness.json"),
  serialized,
  "utf8",
);

if (result.status !== "PASSED") {
  const failed = [
    ...commands.filter((command) => !command.passed).map((command) => command.id),
    ...evidenceChecks.filter((item) => !item.passed).map((item) => item.id),
  ];
  console.error(`FINAL_READINESS_AUDIT_FAIL failed=${failed.join(",")}`);
  console.error(`artifact=${latestPath}`);
  process.exitCode = 1;
} else {
  console.log(
    `FINAL_READINESS_AUDIT_PASS commands=${commands.length} checks=${evidenceChecks.length} ` +
      `tests=${unit.testCount} e2e=9 cleanStart=3 comparisons=${frozen.comparisonCount}`,
  );
  console.log(`artifact=${latestPath}`);
  console.log(`immutableRun=${immutableDirectory}`);
}
