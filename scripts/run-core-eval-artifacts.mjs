import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(".");
const outputDirectory = resolve(root, "artifacts/evals");
const temporaryVitestResult = resolve(root, "tmp/vitest-core-evidence.json");
const capturedAt = new Date().toISOString();
const runDirectory = resolve(
  outputDirectory,
  "core-evidence-runs",
  capturedAt.replaceAll(":", "-").replaceAll(".", "-"),
);

const latestArtifactNames = [
  "unit-summary.json",
  "scenario-results.csv",
  "baseline-comparison.csv",
  "frozen-variant-results.csv",
  "frozen-benchmark-summary.json",
  "risk-transfer-boundaries.csv",
  "risk-transfer-boundary-summary.json",
  "decision-workflow-boundaries.csv",
  "decision-workflow-boundary-summary.json",
  "domestic-track-compliance-latest.json",
  "domestic-ai-smoke.csv",
  "upstage-roundtrip.csv",
  "upstage-document-roundtrip-mock-latest.json",
  "upstage-document-roundtrip-mock-latest.csv",
  "accessibility-summary.json",
  "map-performance-summary.json",
  "spatial-scene-summary.json",
  "rider-reference-round2-stimulus-manifest.json",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function csvCell(value) {
  const text = value === undefined || value === null
    ? ""
    : Array.isArray(value)
      ? value.join("|")
      : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(columns, rows) {
  return `${[
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n")}\n`;
}

async function writeJson(fileName, value) {
  await writeFile(
    resolve(outputDirectory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function readJson(fileName) {
  return JSON.parse(await readFile(resolve(outputDirectory, fileName), "utf8"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  return (result.stdout ?? "").trim();
}

function git(args) {
  return run("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...args], {
    env: { ...process.env, GIT_CONFIG_GLOBAL: "NUL", GIT_TERMINAL_PROMPT: "0" },
  });
}

async function generateUnitSummary() {
  await mkdir(resolve(root, "tmp"), { recursive: true });
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new Error("pnpm entry point is not available");
  run(process.execPath, [
    pnpmEntry,
    "exec",
    "vitest",
    "run",
    "--reporter=json",
    `--outputFile=${relative(root, temporaryVitestResult).replaceAll("\\", "/")}`,
  ]);
  const result = JSON.parse(await readFile(temporaryVitestResult, "utf8"));
  if (!result.success || result.numFailedTests !== 0) {
    throw new Error("Vitest result is not a clean pass");
  }
  await writeJson("unit-summary.json", {
    schemaVersion: "unit-summary-v1",
    capturedAt,
    command: "pnpm exec vitest run --reporter=json",
    framework: "Vitest",
    testFileCount: result.testResults.length,
    testCount: result.numTotalTests,
    passed: result.numPassedTests,
    failed: result.numFailedTests,
    pending: result.numPendingTests,
    success: result.success,
    files: result.testResults.map((item) => ({
      file: basename(item.name),
      status: item.status,
      assertionCount: item.assertionResults.length,
    })),
  });
  return result.numTotalTests;
}

async function generateDomainArtifacts() {
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  try {
    const fixtures = await vite.ssrLoadModule("/src/adapters/fixtures/index.ts");
    const safety = await vite.ssrLoadModule("/src/domain/safety/index.ts");
    const frozen = await vite.ssrLoadModule("/src/evals/frozenBenchmark.ts");
    const riskTransfer = await vite.ssrLoadModule(
      "/src/evals/riskTransferBoundaries.ts",
    );
    const decisionWorkflow = await vite.ssrLoadModule(
      "/src/evals/decisionWorkflowBoundaries.ts",
    );
    const scenarioRows = fixtures.scenarioFixtures.map((fixture) => {
      const snapshot = safety.evaluateSafetyBudget(fixture, fixture.couriers[0].courierId);
      return {
        fixtureId: fixture.fixtureId,
        scenario: fixture.scenario,
        dataMode: "MOCK",
        isDemo: true,
        currentBudget: snapshot.currentBudget,
        minimumForecastBudget: snapshot.minimumForecastBudget,
        breachStatus: snapshot.breach.status,
        timeToBreachMinutes: snapshot.breach.timeToBreachMinutes,
        breachStopId: snapshot.breach.stopId,
        confidenceScore: snapshot.confidenceScore,
        safetyModelVersion: snapshot.versionContext.safetyModelVersion,
        safetyConfigVersion: snapshot.versionContext.safetyConfigVersion,
      };
    });
    await writeFile(
      resolve(outputDirectory, "scenario-results.csv"),
      toCsv(Object.keys(scenarioRows[0]), scenarioRows),
      "utf8",
    );

    const benchmark = frozen.evaluateFrozenBenchmark(fixtures.scenarioFixtures);
    await writeFile(
      resolve(outputDirectory, "baseline-comparison.csv"),
      toCsv(Object.keys(benchmark.comparisons[0]), benchmark.comparisons),
      "utf8",
    );
    await writeFile(
      resolve(outputDirectory, "frozen-variant-results.csv"),
      toCsv(Object.keys(benchmark.variantResults[0]), benchmark.variantResults),
      "utf8",
    );
    await writeJson("frozen-benchmark-summary.json", {
      schemaVersion: benchmark.schemaVersion,
      capturedAt,
      generatorVersion: benchmark.generatorVersion,
      seedStart: benchmark.seedStart,
      split: benchmark.split,
      dataMode: benchmark.dataMode,
      isDemo: benchmark.isDemo,
      parentCount: benchmark.parentCount,
      mutationCountPerParent: benchmark.mutationCountPerParent,
      variantCount: benchmark.variantCount,
      comparisonCount: benchmark.comparisonCount,
      strategies: benchmark.strategies,
      allSafeRouteSelectionsRespectHardConstraints:
        benchmark.allSafeRouteSelectionsRespectHardConstraints,
      limitations: [
        "Synthetic deterministic simulation; not evidence of real accident reduction.",
        "Fastest-only and Balanced-only intentionally do not filter hard-constraint violations.",
        "Optional self-check missingness does not add a confidence penalty in safety-config-v1.0.0.",
      ],
    });

    const boundarySuite = riskTransfer.evaluateRiskTransferBoundarySuite();
    if (!boundarySuite.allPassed) {
      throw new Error("Risk Transfer Guard boundary suite failed");
    }
    await writeFile(
      resolve(outputDirectory, "risk-transfer-boundaries.csv"),
      toCsv(Object.keys(boundarySuite.rows[0]), boundarySuite.rows),
      "utf8",
    );
    await writeJson("risk-transfer-boundary-summary.json", {
      schemaVersion: boundarySuite.schemaVersion,
      capturedAt,
      generatorVersion: boundarySuite.generatorVersion,
      dataMode: boundarySuite.dataMode,
      isDemo: boundarySuite.isDemo,
      directCaseCount: boundarySuite.directCaseCount,
      fullPlanCaseCount: boundarySuite.fullPlanCaseCount,
      totalCaseCount: boundarySuite.totalCaseCount,
      passedCount: boundarySuite.passedCount,
      failedCount: boundarySuite.failedCount,
      reasonCodeCounts: boundarySuite.reasonCodeCounts,
      allPassed: boundarySuite.allPassed,
      limitations: [
        "Synthetic deterministic guard evaluation; not a field safety outcome.",
        "Direct numeric cases are paired with three full-plan transfer recalculations.",
      ],
    });

    const decisionBoundarySuite =
      decisionWorkflow.evaluateDecisionWorkflowBoundarySuite();
    if (!decisionBoundarySuite.allPassed) {
      throw new Error("Decision workflow boundary suite failed");
    }
    await writeFile(
      resolve(outputDirectory, "decision-workflow-boundaries.csv"),
      toCsv(Object.keys(decisionBoundarySuite.rows[0]), decisionBoundarySuite.rows),
      "utf8",
    );
    await writeJson("decision-workflow-boundary-summary.json", {
      schemaVersion: decisionBoundarySuite.schemaVersion,
      capturedAt,
      generatorVersion: decisionBoundarySuite.generatorVersion,
      dataMode: decisionBoundarySuite.dataMode,
      isDemo: decisionBoundarySuite.isDemo,
      caseCount: decisionBoundarySuite.caseCount,
      categoryCounts: decisionBoundarySuite.categoryCounts,
      passedCount: decisionBoundarySuite.passedCount,
      failedCount: decisionBoundarySuite.failedCount,
      reasonCodeCounts: decisionBoundarySuite.reasonCodeCounts,
      allPassed: decisionBoundarySuite.allPassed,
      limitations: [
        "Synthetic deterministic workflow evaluation; not evidence of field behavior.",
        "Boundary cases validate the MVP in-memory decision state machine and plan store.",
      ],
    });
    return {
      scenarios: scenarioRows.length,
      frozenVariants: benchmark.variantCount,
      comparisons: benchmark.comparisonCount,
      transferBoundaries: boundarySuite.totalCaseCount,
      directTransferBoundaries: boundarySuite.directCaseCount,
      decisionWorkflowBoundaries: decisionBoundarySuite.caseCount,
    };
  } finally {
    await vite.close();
  }
}

async function generateAiEvidence() {
  const domesticFiles = [
    "domestic-ai-api-smoke-mock-latest.json",
    "domestic-ai-api-runs/2026-07-17T11-37-10-732Z-live-exaone/domestic-ai-api-smoke-latest.json",
    "domestic-ai-api-runs/2026-07-23T11-08-49-486Z-live-ax/domestic-ai-api-smoke-latest.json",
  ];
  const domesticRows = [];
  for (const file of domesticFiles) {
    const evidence = await readJson(file);
    for (const provider of evidence.run.providers) {
      domesticRows.push({
        providerId: provider.providerId,
        providerMode: provider.providerMode,
        protocol: provider.protocol,
        model: provider.model,
        promptVersion: provider.promptVersion,
        taskCount: provider.taskCount,
        passedCount: provider.metrics.passed,
        fallbackCount: provider.metrics.fallback,
        unsafeDisplayCount: provider.metrics.unsafeDisplayCount,
        firstAttemptPassRate: provider.metrics.firstAttemptPassRate,
        evidenceArtifact: file,
      });
    }
  }
  await writeFile(
    resolve(outputDirectory, "domestic-ai-smoke.csv"),
    toCsv(Object.keys(domesticRows[0]), domesticRows),
    "utf8",
  );

  const mock = (await readJson("upstage-smoke-mock-latest.json")).run;
  const live = (await readJson("upstage-smoke-latest.json")).run;
  const mockByTask = new Map(mock.results.map((result) => [result.taskId, result]));
  const upstageRows = live.results.map((result) => {
    const mockResult = mockByTask.get(result.taskId);
    if (!mockResult) throw new Error(`Missing Upstage mock task ${result.taskId}`);
    return {
      taskId: result.taskId,
      role: result.role,
      mockModel: mock.model,
      mockPassed: mockResult.passed,
      liveModel: live.model,
      liveStatus: result.status,
      livePassed: result.passed,
      liveFallbackCode: result.fallbackCode,
      liveLatencyMs: result.latencyMs,
      citedFactCount: result.citedFactCount,
      citationCount: result.citationCount,
    };
  });
  await writeFile(
    resolve(outputDirectory, "upstage-roundtrip.csv"),
    toCsv(Object.keys(upstageRows[0]), upstageRows),
    "utf8",
  );
  return { domesticProviders: domesticRows.length, upstageTasks: upstageRows.length };
}

async function generateManifest() {
  const accessibility = await readJson("accessibility-summary.json");
  if (!accessibility.passed) throw new Error("Accessibility evidence did not pass");
  const mapPerformance = await readJson("map-performance-summary.json");
  if (
    mapPerformance.status !== "PASSED" ||
    mapPerformance.dataMode !== "DEMO" ||
    mapPerformance.renderer !== "FALLBACK_2D"
  ) {
    throw new Error("G4-B map performance evidence did not pass its Demo Fallback gate");
  }
  const spatialScene = await readJson("spatial-scene-summary.json");
  if (
    spatialScene.status !== "PASSED" ||
    spatialScene.dataMode !== "DEMO" ||
    spatialScene.renderer !== "PROVIDER_INDEPENDENT_SVG_2_5D" ||
    spatialScene.metrics.identifierMismatchCount !== 0 ||
    spatialScene.metrics.numericMismatchCount !== 0 ||
    spatialScene.metrics.additionalRuntimeDependencyCount !== 0 ||
    spatialScene.metrics.additionalGzipJsKiB >
      spatialScene.budget.maximumAdditionalGzipJsKiB
  ) {
    throw new Error("G5-A spatial scene evidence did not pass its Demo contract gate");
  }
  const riderReferenceStimulus = await readJson(
    "rider-reference-round2-stimulus-manifest.json",
  );
  const riderReferenceImage = await readFile(
    resolve(root, riderReferenceStimulus.stimulus?.path ?? ""),
  );
  if (
    riderReferenceStimulus.schemaVersion !==
      "rider-reference-stimulus-manifest-v2" ||
    riderReferenceStimulus.studyId !==
      "rider-route-product-boundary-round2-001" ||
    riderReferenceStimulus.dataMode !== "DEMO" ||
    riderReferenceStimulus.stimulus?.width !== 390 ||
    riderReferenceStimulus.stimulus?.height !== 844 ||
    riderReferenceStimulus.questions?.length !== 6 ||
    sha256(riderReferenceImage) !== riderReferenceStimulus.stimulus.sha256
  ) {
    throw new Error(
      "Rider reference stimulus did not pass its fixed Demo integrity gate",
    );
  }
  const artifacts = [];
  for (const file of latestArtifactNames) {
    const bytes = await readFile(resolve(outputDirectory, file));
    artifacts.push({ file, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  const sourceFiles = [
    "scripts/run-core-eval-artifacts.mjs",
    "scripts/run-domestic-track-audit.mjs",
    "src/evals/frozenBenchmark.ts",
    "tests/frozen-benchmark.test.ts",
    "src/evals/riskTransferBoundaries.ts",
    "tests/risk-transfer-boundaries.test.ts",
    "src/evals/decisionWorkflowBoundaries.ts",
    "tests/decision-workflow-boundaries.test.ts",
    "src/domain/safety/config.ts",
    "src/domain/safety/engine.ts",
    "src/domain/interventions/config.ts",
    "src/domain/interventions/engine.ts",
    "src/adapters/fixtures/index.ts",
    "src/adapters/fixtures/multiRegionMapFixture.ts",
    "src/adapters/maps/index.ts",
    "src/adapters/maps/spatialScene.ts",
    "tests/map-performance-budget.test.ts",
    "tests/spatial-scene.test.ts",
    "e2e/map-performance.spec.ts",
    "e2e/spatial-scene.spec.ts",
    "e2e/saferoute-demo.spec.ts",
    "scripts/build-rider-reference-stimulus.mjs",
    "scripts/run-rider-reference-comprehension.mjs",
    "src/evals/riderReferenceComprehension.ts",
    "tests/rider-reference-comprehension.test.ts",
    "e2e/rider-reference-review.spec.ts",
  ];
  const sourceHashes = [];
  for (const file of sourceFiles) {
    const bytes = await readFile(resolve(root, file));
    sourceHashes.push({ file, sha256: sha256(bytes) });
  }
  const baseCommit = git(["rev-parse", "HEAD"]);
  const workingTreeDirty = git(["status", "--porcelain"]).length > 0;
  await writeJson("run-manifest.json", {
    schemaVersion: "core-eval-run-manifest-v1",
    capturedAt,
    generator: "scripts/run-core-eval-artifacts.mjs",
    command: "pnpm run eval:core-artifacts",
    baseCommit,
    workingTreeDirty,
    dataClassification: "synthetic Demo fixtures and redacted evaluation summaries",
    credentialsStored: false,
    rawApiResponsesStored: false,
    selfHashExcluded: true,
    sourceHashes,
    artifacts,
  });
  await mkdir(resolve(outputDirectory, "core-evidence-runs"), { recursive: true });
  await mkdir(runDirectory, { recursive: false });
  for (const file of [...latestArtifactNames, "run-manifest.json"]) {
    await copyFile(resolve(outputDirectory, file), resolve(runDirectory, file));
  }
}

await mkdir(outputDirectory, { recursive: true });
try {
  run(process.execPath, [resolve(root, "scripts/run-domestic-track-audit.mjs")]);
  const testCount = await generateUnitSummary();
  const domain = await generateDomainArtifacts();
  const ai = await generateAiEvidence();
  await generateManifest();
  console.log(
    `CORE_EVAL_ARTIFACTS_PASS tests=${testCount} scenarios=${domain.scenarios} ` +
      `frozenVariants=${domain.frozenVariants} comparisons=${domain.comparisons} ` +
      `transferBoundaries=${domain.transferBoundaries} directTransferBoundaries=${domain.directTransferBoundaries} ` +
      `decisionWorkflowBoundaries=${domain.decisionWorkflowBoundaries} ` +
      `domesticProviders=${ai.domesticProviders} upstageTasks=${ai.upstageTasks} artifacts=${latestArtifactNames.length}`,
  );
} finally {
  await rm(temporaryVitestResult, { force: true });
}
