import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

async function readOptionalJson(fileName) {
  try {
    return await readJson(fileName);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function check(id, passed, details) {
  return { id, passed, details };
}

const commands = [
  runPnpm("BUILD", ["run", "build"], /built in/i),
  runPnpm("PLAYWRIGHT_E2E", ["run", "test:e2e"], /21 passed/),
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
  "docs/submission-package.md",
  "docs/final-readiness.md",
  "docs/g5-spatial-visualization-design.md",
  "docs/g5-spatial-comprehension-test.md",
  "docs/rider-reference-comprehension-test.md",
  "docs/geospatial-pwa-implementation-plan.md",
  "docs/goal-completion-audit.md",
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
const mapPerformance = await readJson("map-performance-summary.json");
const spatialScene = await readJson("spatial-scene-summary.json");
const riderReferenceStimulus = await readJson(
  "rider-reference-round2-stimulus-manifest.json",
);
const riderReferenceStimulusImage = await readFile(
  resolve(root, riderReferenceStimulus.stimulus?.path ?? ""),
);
const spatialComprehensionRound4 = await readOptionalJson(
  "g5-spatial-comprehension-round4-summary.json",
);
const spatialComprehensionRound3 = await readOptionalJson(
  "g5-spatial-comprehension-round3-summary.json",
);
const spatialComprehensionRound2 = await readOptionalJson(
  "g5-spatial-comprehension-round2-summary.json",
);
const spatialComprehensionRound1 = await readOptionalJson(
  "g5-spatial-comprehension-summary.json",
);
let spatialComprehension = spatialComprehensionRound4 ??
  spatialComprehensionRound3 ??
  spatialComprehensionRound2 ??
  spatialComprehensionRound1 ?? {
  status: "NOT_RUN",
  reviewerCount: 0,
  answerAccuracy: null,
  defaultPromotionEligible: false,
};
if (
  spatialComprehensionRound4 &&
  (spatialComprehensionRound4.schemaVersion !==
    "g5-spatial-comprehension-summary-v4" ||
    spatialComprehensionRound4.studyId !==
      "g5-b-decision-spatial-comprehension-round4-001" ||
    spatialComprehensionRound4.dataMode !== "DEMO" ||
    spatialComprehensionRound4.reviewerCount < 3)
) {
  throw new Error("Invalid G5-B Round 4 human comprehension summary");
}
if (
  !spatialComprehensionRound4 &&
  spatialComprehensionRound3 &&
  (spatialComprehensionRound3.schemaVersion !==
    "g5-spatial-comprehension-summary-v3" ||
    spatialComprehensionRound3.studyId !==
      "g5-b-decision-spatial-comprehension-round3-001" ||
    spatialComprehensionRound3.dataMode !== "DEMO" ||
    spatialComprehensionRound3.reviewerCount < 3)
) {
  throw new Error("Invalid G5-B Round 3 human comprehension summary");
}
if (
  !spatialComprehensionRound4 &&
  !spatialComprehensionRound3 &&
  spatialComprehensionRound2 &&
  (spatialComprehensionRound2.schemaVersion !==
    "g5-spatial-comprehension-summary-v2" ||
    spatialComprehensionRound2.studyId !==
      "g5-b-decision-spatial-comprehension-round2-001" ||
    spatialComprehensionRound2.dataMode !== "DEMO" ||
    spatialComprehensionRound2.reviewerCount < 3)
) {
  throw new Error("Invalid G5-B Round 2 human comprehension summary");
}
if (
  !spatialComprehensionRound4 &&
  !spatialComprehensionRound3 &&
  !spatialComprehensionRound2 &&
  spatialComprehensionRound1 &&
  (spatialComprehensionRound1.schemaVersion !==
    "g5-spatial-comprehension-summary-v1" ||
    spatialComprehensionRound1.studyId !==
      "g5-b-decision-spatial-comprehension-001" ||
    spatialComprehensionRound1.dataMode !== "DEMO" ||
    spatialComprehensionRound1.reviewerCount < 3)
) {
  throw new Error("Invalid G5-B Round 1 human comprehension summary");
}
let riderReferenceComprehension = {
  status: "NOT_RUN",
  reviewerCount: 0,
  taskAccuracy: null,
  fullyCorrectReviewerRate: null,
  criticalMisconceptionCount: null,
  comprehensionPassed: false,
};
try {
  riderReferenceComprehension = await readJson(
    "rider-reference-comprehension-round2-summary.json",
  );
} catch {
  try {
    riderReferenceComprehension = await readJson(
      "rider-reference-comprehension-summary.json",
    );
  } catch {
    // Rider reference comprehension remains a human gate until five valid responses exist.
  }
}
let publicDemoBuild = {
  configured: false,
  workerPresent: false,
  staticShellPackaged: false,
  publicReviewKitPackaged: false,
  packagedMetadataMatches: false,
};
try {
  const hostingConfigText = await readFile(
    resolve(root, ".openai/hosting.json"),
    "utf8",
  );
  const packagedHostingConfigText = await readFile(
    resolve(root, "dist/.openai/hosting.json"),
    "utf8",
  );
  const workerSource = await readFile(
    resolve(root, "dist/server/index.js"),
    "utf8",
  );
  const publicIndex = await readFile(
    resolve(root, "dist/client/index.html"),
    "utf8",
  );
  const publicManifest = JSON.parse(
    await readFile(
      resolve(root, "dist/client/manifest.webmanifest"),
      "utf8",
    ),
  );
  const publicServiceWorker = await readFile(
    resolve(root, "dist/client/sw.js"),
    "utf8",
  );
  const publicIcon192 = await stat(
    resolve(root, "dist/client/icons/saferoute-192.png"),
  );
  const publicIcon512 = await stat(
    resolve(root, "dist/client/icons/saferoute-512.png"),
  );
  const publicG5ReviewIndex = await readFile(
    resolve(root, "dist/client/tools/g5-spatial-review/index.html"),
    "utf8",
  );
  const publicG5ReviewApp = await readFile(
    resolve(root, "dist/client/tools/g5-spatial-review/app.js"),
    "utf8",
  );
  const publicRiderReviewIndex = await readFile(
    resolve(root, "dist/client/tools/rider-reference-review/index.html"),
    "utf8",
  );
  const publicRiderReviewApp = await readFile(
    resolve(root, "dist/client/tools/rider-reference-review/app.js"),
    "utf8",
  );
  const publicG5Screenshot2d = await stat(
    resolve(
      root,
      "dist/client/artifacts/evals/screenshots/g5-round4-admin-decision-2d-1280x720.png",
    ),
  );
  const publicG5Screenshot25d = await stat(
    resolve(
      root,
      "dist/client/artifacts/evals/screenshots/g5-round4-admin-decision-2-5d-1280x720.png",
    ),
  );
  const publicRiderScreenshot = await stat(
    resolve(
      root,
      "dist/client/artifacts/evals/screenshots/rider-source-route-round2-390x844.png",
    ),
  );
  const forbiddenReviewNetworkApi =
    /(fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket)/;
  const hostingConfig = JSON.parse(hostingConfigText);
  publicDemoBuild = {
    configured:
      typeof hostingConfig.project_id === "string" &&
      hostingConfig.project_id.startsWith("appgprj_"),
    workerPresent:
      workerSource.includes("env.ASSETS.fetch") &&
      workerSource.includes("/index.html") &&
      publicIndex.includes('<div id="root"></div>'),
    staticShellPackaged:
      publicManifest.display === "standalone" &&
      publicServiceWorker.includes('SHELL_VERSION = "saferoute-shell-v1.0.5"') &&
      publicServiceWorker.includes('"/tools/g5-spatial-review/"') &&
      publicServiceWorker.includes('"/tools/rider-reference-review/"') &&
      publicServiceWorker.includes('fetch(request, { cache: "no-store" })') &&
      publicIcon192.size > 1_000 &&
      publicIcon512.size > 2_000,
    publicReviewKitPackaged:
      publicG5ReviewIndex.includes("SafeRoute G5-B · Round 4") &&
      publicG5ReviewIndex.includes('name="robots" content="noindex,nofollow"') &&
      publicG5ReviewIndex.includes(
        'src="./app.js?study=g5-round4-001"',
      ) &&
      publicG5ReviewApp.includes(
        'studyId: "g5-b-decision-spatial-comprehension-round4-001"',
      ) &&
      publicG5ReviewApp.includes(
        'link.download = "g5-spatial-comprehension-round4-results.json"',
      ) &&
      publicRiderReviewIndex.includes(
        "SafeRoute 기사 운행·제품 경계 Round 2",
      ) &&
      publicRiderReviewIndex.includes(
        'name="robots" content="noindex,nofollow"',
      ) &&
      publicRiderReviewApp.includes(
        'studyId: "rider-route-product-boundary-round2-001"',
      ) &&
      publicRiderReviewApp.includes(
        'link.download = "rider-reference-comprehension-round2-results.json"',
      ) &&
      !forbiddenReviewNetworkApi.test(
        `${publicG5ReviewApp}\n${publicRiderReviewApp}`,
      ) &&
      publicG5Screenshot2d.size > 200_000 &&
      publicG5Screenshot25d.size > 200_000 &&
      publicRiderScreenshot.size > 100_000,
    packagedMetadataMatches:
      hostingConfigText.trim() === packagedHostingConfigText.trim(),
  };
} catch {
  publicDemoBuild = {
    configured: false,
    workerPresent: false,
    staticShellPackaged: false,
    publicReviewKitPackaged: false,
    packagedMetadataMatches: false,
  };
}
const safeRouteStrategy = frozen.strategies.find(
  (strategy) => strategy.strategy === "SAFEROUTE",
);
const requiredCoreArtifactFiles = [
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
const coreArtifactFiles = new Set(
  coreManifest.artifacts.map((artifact) => artifact.file),
);
const missingCoreArtifactFiles = requiredCoreArtifactFiles.filter(
  (file) => !coreArtifactFiles.has(file),
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
    coreManifest.artifacts.length === requiredCoreArtifactFiles.length &&
      missingCoreArtifactFiles.length === 0 &&
      coreManifest.credentialsStored === false &&
      coreManifest.rawApiResponsesStored === false,
    `${coreManifest.artifacts.length}/${requiredCoreArtifactFiles.length} artifacts, missing=${missingCoreArtifactFiles.length}, credentialsStored=${coreManifest.credentialsStored}`,
  ),
  check(
    "RIDER_REFERENCE_STIMULUS",
    riderReferenceStimulus.schemaVersion ===
      "rider-reference-stimulus-manifest-v2" &&
      riderReferenceStimulus.studyId ===
        "rider-route-product-boundary-round2-001" &&
      riderReferenceStimulus.dataMode === "DEMO" &&
      riderReferenceStimulus.stimulus?.width === 390 &&
      riderReferenceStimulus.stimulus?.height === 844 &&
      riderReferenceStimulus.questions?.length === 6 &&
      sha256(riderReferenceStimulusImage) ===
        riderReferenceStimulus.stimulus?.sha256,
    `size=${riderReferenceStimulus.stimulus?.width}x${riderReferenceStimulus.stimulus?.height}, questions=${riderReferenceStimulus.questions?.length}, dataMode=${riderReferenceStimulus.dataMode}`,
  ),
  check(
    "MAP_PERFORMANCE_G4_B",
    mapPerformance.status === "PASSED" &&
      mapPerformance.dataMode === "DEMO" &&
      mapPerformance.renderer === "FALLBACK_2D" &&
      mapPerformance.profiles.length === 3 &&
      mapPerformance.profiles.every((profile) => profile.passed) &&
      mapPerformance.budget.maxTotalCouriers === 240 &&
      mapPerformance.budget.maxVisibleRegionCouriers === 80 &&
      mapPerformance.budget.maxRenderedRegionRoutes === 24,
    `${mapPerformance.profiles.filter((profile) => profile.passed).length}/${mapPerformance.profiles.length} profiles, max=${mapPerformance.budget.maxTotalCouriers} couriers`,
  ),
  check(
    "SPATIAL_SCENE_G5_A",
    spatialScene.status === "PASSED" &&
      spatialScene.dataMode === "DEMO" &&
      spatialScene.renderer === "PROVIDER_INDEPENDENT_SVG_2_5D" &&
      spatialScene.metrics.identifierMismatchCount === 0 &&
      spatialScene.metrics.numericMismatchCount === 0 &&
      spatialScene.metrics.additionalRuntimeDependencyCount === 0 &&
      spatialScene.metrics.additionalGzipJsKiB <= spatialScene.budget.maximumAdditionalGzipJsKiB &&
      spatialScene.metrics.firstDisplayMs <= spatialScene.budget.maximumFirstDisplayMs &&
      spatialScene.metrics.returnTo2dMs <= spatialScene.budget.maximumModeSwitchMs &&
      spatialScene.metrics.p95FrameGapMs <= spatialScene.budget.maximumP95FrameGapMs &&
      spatialScene.metrics.maxFrameGapMs <= spatialScene.budget.maximumFrameGapMs,
    `renderer=${spatialScene.renderer}, mismatch=${spatialScene.metrics.identifierMismatchCount + spatialScene.metrics.numericMismatchCount}, dependencies=${spatialScene.metrics.additionalRuntimeDependencyCount}, gzipDelta=${spatialScene.metrics.additionalGzipJsKiB}KiB`,
  ),
  check(
    "PUBLIC_DEMO_BUILD",
    publicDemoBuild.configured &&
      publicDemoBuild.workerPresent &&
      publicDemoBuild.staticShellPackaged &&
      publicDemoBuild.packagedMetadataMatches,
    `configured=${publicDemoBuild.configured}, worker=${publicDemoBuild.workerPresent}, shell=${publicDemoBuild.staticShellPackaged}, metadata=${publicDemoBuild.packagedMetadataMatches}`,
  ),
  check(
    "PUBLIC_HUMAN_REVIEW_KIT",
    publicDemoBuild.publicReviewKitPackaged,
    `packaged=${publicDemoBuild.publicReviewKitPackaged}, upload=false, local-download-only=true`,
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
    e2eTests: 21,
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
    publicDemoBuildReady:
      publicDemoBuild.configured &&
      publicDemoBuild.workerPresent &&
      publicDemoBuild.staticShellPackaged &&
      publicDemoBuild.packagedMetadataMatches,
    publicHumanReviewKitReady: publicDemoBuild.publicReviewKitPackaged,
    mapPerformanceProfiles: mapPerformance.profiles.length,
    maxEvaluatedMapCouriers: mapPerformance.budget.maxTotalCouriers,
    spatialSceneRenderer: spatialScene.renderer,
    spatialSceneMismatchCount:
      spatialScene.metrics.identifierMismatchCount +
      spatialScene.metrics.numericMismatchCount,
    g5HumanComprehensionStatus: spatialComprehension.status,
    g5HumanComprehensionStudyId: spatialComprehension.studyId ?? null,
    g5HumanEvidenceRound: spatialComprehensionRound4
      ? "ROUND_4"
      : spatialComprehensionRound3
        ? "ROUND_3"
      : spatialComprehensionRound2
        ? "ROUND_2"
        : spatialComprehensionRound1
          ? "ROUND_1"
          : "NOT_RUN",
    g5HumanReviewerCount: spatialComprehension.reviewerCount,
    g5HumanAnswerAccuracy: spatialComprehension.answerAccuracy,
    g5DefaultPromotionEligible:
      spatialComprehension.defaultPromotionEligible,
    riderReferenceComprehensionStatus: riderReferenceComprehension.status,
    riderReferenceReviewerCount: riderReferenceComprehension.reviewerCount,
    riderReferenceTaskAccuracy: riderReferenceComprehension.taskAccuracy,
    riderReferenceFullyCorrectReviewerRate:
      riderReferenceComprehension.fullyCorrectReviewerRate,
    riderReferenceCriticalMisconceptionCount:
      riderReferenceComprehension.criticalMisconceptionCount,
  },
  explicitLimitations: [
    "The public Finals Demo is not approval for production operation.",
    "No real courier or customer personal data is processed.",
    "Kakao Maps renders synthetic Demo coordinates only; no real courier location, TMS, authentication, or customer message delivery is integrated.",
    "A.X K1 Live passed the fixed 12-task explanation benchmark on 2026-07-23, but remains an optional evidence-layer dependency with account quota and input-retention policy still unverified.",
    "Synthetic simulation results are not evidence of real accident reduction.",
    spatialComprehension.status === "DO_NOT_PROMOTE"
      ? "The latest completed G5-B human review remains DO_NOT_PROMOTE; 2.5D must not be promoted and the Round 4 decision view requires independent retest."
      : "G5-B human comprehension evidence does not authorize automatic 2.5D default promotion.",
    riderReferenceComprehension.status === "READY_TO_PROMOTE"
      ? "Rider reference comprehension evidence does not authorize live GPS, navigation, sensor, or field-performance claims."
      : "Rider route and product-boundary comprehension has not passed five-person independent review.",
  ],
  remainingHumanChecks: [
    "Run on the actual presentation PC at 1280x720 and browser zoom 100%.",
    "Assign presenter and recovery operator roles.",
    "Confirm the exact submission form, video filename, and organizer upload deadline.",
    "Record the final GitHub commit SHA in the submitted materials.",
    ...(spatialComprehension.status === "DO_NOT_PROMOTE"
      ? ["Complete G5-B Round 4 with three independent reviewers."]
      : []),
    ...(riderReferenceComprehension.status !== "READY_TO_PROMOTE"
      ? ["Complete the five-person rider route and product-boundary comprehension review."]
      : []),
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
      `tests=${unit.testCount} e2e=21 cleanStart=3 comparisons=${frozen.comparisonCount}`,
  );
  console.log(`artifact=${latestPath}`);
  console.log(`immutableRun=${immutableDirectory}`);
}
