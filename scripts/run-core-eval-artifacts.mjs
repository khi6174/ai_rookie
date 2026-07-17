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
  "risk-transfer-boundaries.csv",
  "domestic-ai-smoke.csv",
  "upstage-roundtrip.csv",
  "accessibility-summary.json",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function roundForEvidence(value) {
  return Number(value.toFixed(6));
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

function sourceImpact(evaluation) {
  return evaluation.courierImpacts.find((impact) => impact.role === "SOURCE");
}

function recipientImpact(evaluation) {
  return evaluation.courierImpacts.find((impact) => impact.role === "RECIPIENT");
}

function feasibilityReasons(evaluation) {
  return evaluation.reasons.map((reason) => reason.code).join("|");
}

function nightReorderOrder(fixture) {
  const policy = fixture.interventionInputs?.reorderPolicies[0];
  if (!policy) throw new Error("Night fixture has no reorder policy");
  const baselineOrder = fixture.workloads[0].remainingStopIds;
  const movableStairs = fixture.stops
    .filter(
      (stop) =>
        stop.access.elevator === "UNAVAILABLE" &&
        policy.reorderableStopIds.includes(stop.stopId),
    )
    .map((stop) => stop.stopId);
  const reordered = [
    ...movableStairs,
    ...baselineOrder.filter((stopId) => !movableStairs.includes(stopId)),
  ];
  for (const fixedStopId of policy.fixedStopIds) {
    const targetIndex = baselineOrder.indexOf(fixedStopId);
    reordered.splice(reordered.indexOf(fixedStopId), 1);
    reordered.splice(targetIndex, 0, fixedStopId);
  }
  return reordered;
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
    const interventions = await vite.ssrLoadModule("/src/domain/interventions/index.ts");
    const demo = await vite.ssrLoadModule("/src/ui/demoSession.ts");
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

    const heat = fixtures.heatHeavyStairsFixture;
    const heatCourier = heat.couriers[0].courierId;
    const heatPolicy = heat.interventionInputs?.safeDelayPolicies[0];
    if (!heatPolicy) throw new Error("Heat fixture has no Safe Delay policy");
    const heatCandidates = [
      interventions.createRestCandidate(heat, "decision-core-evidence-heat-v1", heatCourier, 15),
      interventions.createSafeDelayCandidate(
        heat,
        "decision-core-evidence-heat-v1",
        heatCourier,
        heatPolicy.delayableStopIds.slice(0, 3),
        "2026-07-14T04:45:00.000Z",
      ),
    ];

    const night = fixtures.noviceNightUnfamiliarFixture;
    const nightCourier = night.couriers[0].courierId;
    const route = night.interventionInputs?.saferRouteAlternatives[0];
    if (!route) throw new Error("Night fixture has no safer-route alternative");
    const nightCandidates = [
      interventions.createReorderCandidate(
        night,
        "decision-core-evidence-night-v1",
        nightCourier,
        nightReorderOrder(night),
      ),
      interventions.createSaferRouteCandidate(
        night,
        "decision-core-evidence-night-v1",
        nightCourier,
        route.replacementRouteId,
        route.replacedSegmentIds,
      ),
    ];
    const rankedByFixture = new Map([
      [fixtures.rainyHillyLongShiftFixture.fixtureId, demo.demoEvaluations],
      [heat.fixtureId, interventions.rankInterventions(
        heatCandidates.map((candidate) => interventions.evaluateIntervention(heat, candidate)),
      )],
      [night.fixtureId, interventions.rankInterventions(
        nightCandidates.map((candidate) => interventions.evaluateIntervention(night, candidate)),
      )],
    ]);
    const candidateById = new Map([
      ...demo.demoCandidates,
      ...heatCandidates,
      ...nightCandidates,
    ].map((candidate) => [candidate.candidateId, candidate]));
    const baselineRows = [...rankedByFixture].flatMap(([fixtureId, evaluations]) =>
      evaluations.map((evaluation) => {
        const candidate = candidateById.get(evaluation.candidateId);
        if (!candidate) throw new Error(`Missing candidate ${evaluation.candidateId}`);
        const source = sourceImpact(evaluation);
        const recipient = recipientImpact(evaluation);
        return {
          fixtureId,
          candidateId: evaluation.candidateId,
          actionKinds: candidate.actions.map((action) => action.type),
          feasibility: evaluation.feasibility.status,
          rank: evaluation.rank,
          baselineMinimumBudget: source?.baselineMinimumBudget,
          candidateMinimumBudget: source?.candidateMinimumBudget,
          safetyGain: evaluation.safetyGain,
          breachOutcome: evaluation.breachOutcome,
          etaDeltaMinutes: evaluation.etaDeltaMinutes,
          maxCustomerEtaDeltaMinutes: evaluation.maxCustomerEtaDeltaMinutes,
          recipientMinimumBudget: recipient?.candidateMinimumBudget,
          recommendationScore: evaluation.recommendationScore,
          reasonCodes: feasibilityReasons(evaluation),
        };
      }),
    );
    await writeFile(
      resolve(outputDirectory, "baseline-comparison.csv"),
      toCsv(Object.keys(baselineRows[0]), baselineRows),
      "utf8",
    );

    const rainy = fixtures.rainyHillyLongShiftFixture;
    const sourceCourierId = rainy.couriers[0].courierId;
    const recipientCourierId = rainy.couriers[1].courierId;
    const boundaryRows = [4, 8, 12].map((transferredStopCount) => {
      const candidate = interventions.createTransferCandidate(
        rainy,
        `decision-core-evidence-transfer-${transferredStopCount}-v1`,
        {
          sourceCourierId,
          recipientCourierId,
          stopIds: rainy.stops.slice(-transferredStopCount).map((stop) => stop.stopId),
        },
      );
      const evaluation = interventions.evaluateIntervention(rainy, candidate);
      const source = sourceImpact(evaluation);
      const recipient = recipientImpact(evaluation);
      if (!source || !recipient) throw new Error("Transfer evaluation has incomplete impacts");
      return {
        transferredStopCount,
        candidateId: candidate.candidateId,
        feasibility: evaluation.feasibility.status,
        sourceBaselineMinimumBudget: source.baselineMinimumBudget,
        sourceCandidateMinimumBudget: source.candidateMinimumBudget,
        recipientBaselineMinimumBudget: recipient.baselineMinimumBudget,
        recipientCandidateMinimumBudget: recipient.candidateMinimumBudget,
        recipientBudgetDrop: roundForEvidence(
          recipient.baselineMinimumBudget - recipient.candidateMinimumBudget,
        ),
        minimumRecipientThreshold: interventions.interventionConfig.riskTransferGuard.recipientMinimumBudget,
        maximumRecipientDrop: interventions.interventionConfig.riskTransferGuard.maximumRecipientBudgetDrop,
        reasonCodes: feasibilityReasons(evaluation),
      };
    });
    await writeFile(
      resolve(outputDirectory, "risk-transfer-boundaries.csv"),
      toCsv(Object.keys(boundaryRows[0]), boundaryRows),
      "utf8",
    );
    return { scenarios: scenarioRows.length, transferBoundaries: boundaryRows.length };
  } finally {
    await vite.close();
  }
}

async function generateAiEvidence() {
  const domesticFiles = [
    "domestic-ai-api-smoke-mock-latest.json",
    "domestic-ai-api-smoke-latest.json",
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
  const artifacts = [];
  for (const file of latestArtifactNames) {
    const bytes = await readFile(resolve(outputDirectory, file));
    artifacts.push({ file, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  const sourceFiles = [
    "scripts/run-core-eval-artifacts.mjs",
    "src/domain/safety/config.ts",
    "src/domain/safety/engine.ts",
    "src/domain/interventions/config.ts",
    "src/domain/interventions/engine.ts",
    "src/adapters/fixtures/index.ts",
    "e2e/saferoute-demo.spec.ts",
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
  const testCount = await generateUnitSummary();
  const domain = await generateDomainArtifacts();
  const ai = await generateAiEvidence();
  await generateManifest();
  console.log(
    `CORE_EVAL_ARTIFACTS_PASS tests=${testCount} scenarios=${domain.scenarios} ` +
      `transferBoundaries=${domain.transferBoundaries} domesticProviders=${ai.domesticProviders} ` +
      `upstageTasks=${ai.upstageTasks} artifacts=8`,
  );
} finally {
  await rm(temporaryVitestResult, { force: true });
}
