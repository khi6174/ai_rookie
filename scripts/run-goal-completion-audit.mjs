import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(".");
const outputPath = resolve(
  root,
  "artifacts/evals/goal-completion-latest.json",
);
const requireReady = process.argv.includes("--require-ready");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readEvidence(path) {
  const bytes = await readFile(resolve(root, path));
  return {
    path,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    json: JSON.parse(bytes.toString("utf8")),
  };
}

async function readOptionalEvidence(path) {
  try {
    return await readEvidence(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readApprovedDocument(path) {
  const bytes = await readFile(resolve(root, path));
  const text = bytes.toString("utf8");
  const status = text.match(/^- 상태:\s*(.+)$/m)?.[1]?.trim() ?? "MISSING";
  return {
    path,
    status,
    approved: status.startsWith("Approved"),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    text,
  };
}

async function readSource(path) {
  const bytes = await readFile(resolve(root, path));
  return {
    path,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function check(id, passed, evidence, details) {
  return { id, passed, evidence, details };
}

function criterion(id, nameKo, claim, checks, pendingHumanGate = false) {
  const failedChecks = checks.filter((item) => !item.passed);
  return {
    id,
    nameKo,
    claim,
    status: failedChecks.length === 0
      ? "PASSED"
      : pendingHumanGate && failedChecks.every((item) => item.id.startsWith("HUMAN_"))
        ? "HUMAN_VALIDATION_REQUIRED"
        : "FAILED",
    checks,
    blockers: failedChecks.map((item) => item.id),
  };
}

const evidence = {
  finalReadiness: await readEvidence(
    "artifacts/evals/final-readiness-latest.json",
  ),
  frozen: await readEvidence(
    "artifacts/evals/frozen-benchmark-summary.json",
  ),
  riskTransfer: await readEvidence(
    "artifacts/evals/risk-transfer-boundary-summary.json",
  ),
  decisionWorkflow: await readEvidence(
    "artifacts/evals/decision-workflow-boundary-summary.json",
  ),
  domesticTrack: await readEvidence(
    "artifacts/evals/domestic-track-compliance-latest.json",
  ),
  mapPerformance: await readEvidence(
    "artifacts/evals/map-performance-summary.json",
  ),
  upstageDocuments: await readEvidence(
    "artifacts/evals/upstage-document-roundtrip-mock-latest.json",
  ),
  provenance: await readEvidence(
    "artifacts/evals/data-provenance-audit.json",
  ),
};

const g5Round3 = await readOptionalEvidence(
  "artifacts/evals/g5-spatial-comprehension-round3-summary.json",
);
const g5Round2 = await readOptionalEvidence(
  "artifacts/evals/g5-spatial-comprehension-round2-summary.json",
);
const g5Round1 = await readOptionalEvidence(
  "artifacts/evals/g5-spatial-comprehension-summary.json",
);
const g5 = g5Round3 ?? g5Round2 ?? g5Round1;
const riderRound2 = await readOptionalEvidence(
  "artifacts/evals/rider-reference-comprehension-round2-summary.json",
);
const riderRound1 = await readOptionalEvidence(
  "artifacts/evals/rider-reference-comprehension-summary.json",
);
const rider = riderRound2 ?? riderRound1;
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
let evaluateGoalCompletionStatus;
let humanEvidence;
try {
  const goalCompletionModule = await vite.ssrLoadModule(
    "/src/evals/goalCompletion.ts",
  );
  evaluateGoalCompletionStatus =
    goalCompletionModule.evaluateGoalCompletionStatus;
  humanEvidence = goalCompletionModule.evaluateHumanGoalEvidence({
    ...(g5Round3 ? { g5Round3: g5Round3.json } : {}),
    ...(riderRound2 ? { riderRound2: riderRound2.json } : {}),
  });
} finally {
  await vite.close();
}

const documents = {
  product: await readApprovedDocument("docs/product-spec.md"),
  design: await readApprovedDocument("docs/design-system.md"),
  decisions: await readApprovedDocument("docs/decisions.md"),
  privacy: await readApprovedDocument("docs/privacy-and-ai-policy.md"),
  evaluations: await readApprovedDocument("docs/evals.md"),
  domestic: await readApprovedDocument("docs/domestic-ai-track-compliance.md"),
};
const evaluatorSources = await Promise.all([
  readSource("scripts/run-goal-completion-audit.mjs"),
  readSource("src/evals/goalCompletion.ts"),
  readSource("tests/goal-completion.test.ts"),
]);

const final = evidence.finalReadiness.json;
const frozen = evidence.frozen.json;
const safeRoute = frozen.strategies.find(
  ({ strategy }) => strategy === "SAFEROUTE",
);
const riskTransfer = evidence.riskTransfer.json;
const decisionWorkflow = evidence.decisionWorkflow.json;
const domesticTrack = evidence.domesticTrack.json;
const mapPerformance = evidence.mapPerformance.json;
const upstageDocuments = evidence.upstageDocuments.json;
const provenance = evidence.provenance.json;

const g5Round3Passed = humanEvidence.g5Passed;
const riderPassed = humanEvidence.riderPassed;

const criteria = [
  criterion(
    "CREATIVITY",
    "창의성",
    "기존 지도·예방 신호를 복제하지 않고 미래 임계치와 반사실적 안전 개입의 독자 폐루프로 전환한다.",
    [
      check(
        "REFERENCE_BOUNDARY_APPROVED",
        documents.decisions.approved &&
          documents.decisions.text.includes("ADR-051") &&
          documents.decisions.text.includes("아틀란 트럭") &&
          documents.decisions.text.includes("KBS 모빌리티 AI"),
        documents.decisions.path,
        "ADR-051 separates field-map and preventive-signal references from SafeRoute ownership.",
      ),
      check(
        "COUNTERFACTUAL_STRATEGY_COMPARISON",
        frozen.variantCount === 30 &&
          frozen.comparisonCount === 90 &&
          safeRoute?.hardConstraintViolationCount === 0,
        evidence.frozen.path,
        `${frozen.variantCount} variants, ${frozen.comparisonCount} comparisons, SafeRoute violations=${safeRoute?.hardConstraintViolationCount}`,
      ),
    ],
  ),
  criterion(
    "INNOVATION",
    "혁신성",
    "안전을 가중치가 아닌 하드 제약으로 두고 위험전가·동의·버전 충돌을 결정론적으로 차단한다.",
    [
      check(
        "RISK_TRANSFER_GUARD",
        riskTransfer.allPassed === true &&
          riskTransfer.totalCaseCount === 23,
        evidence.riskTransfer.path,
        `${riskTransfer.passedCount}/${riskTransfer.totalCaseCount} passed`,
      ),
      check(
        "DECISION_WORKFLOW_BOUNDARIES",
        decisionWorkflow.allPassed === true &&
          decisionWorkflow.caseCount === 30,
        evidence.decisionWorkflow.path,
        `${decisionWorkflow.passedCount}/${decisionWorkflow.caseCount} passed`,
      ),
      check(
        "DOMESTIC_AI_EVIDENCE_LAYER",
        domesticTrack.status === "PASSED" &&
          domesticTrack.checks.every(({ passed }) => passed) &&
          upstageDocuments.provider === "UPSTAGE" &&
          upstageDocuments.providerMode === "MOCK" &&
          upstageDocuments.metrics?.passed >= 60 &&
          upstageDocuments.metrics?.unsafeDisplayCount === 0,
        `${evidence.domesticTrack.path}; ${evidence.upstageDocuments.path}`,
        `domestic checks=${domesticTrack.checks.filter(({ passed }) => passed).length}/${domesticTrack.checks.length}, Upstage Mock=${upstageDocuments.metrics?.passed}/60, unsafe=${upstageDocuments.metrics?.unsafeDisplayCount}`,
      ),
    ],
  ),
  criterion(
    "EXECUTION",
    "추진성",
    "같은 commit의 결정론적 코드·E2E·clean-start·공개 Demo 빌드를 반복 가능한 Gate로 유지한다.",
    [
      check(
        "FINAL_TECHNICAL_GATE",
        final.status === "PASSED" &&
          final.commands?.every(({ passed }) => passed) &&
          final.evidenceChecks?.every(({ passed }) => passed),
        evidence.finalReadiness.path,
        `commands=${final.commands?.filter(({ passed }) => passed).length}/${final.commands?.length}, checks=${final.evidenceChecks?.filter(({ passed }) => passed).length}/${final.evidenceChecks?.length}`,
      ),
      check(
        "REPRODUCIBLE_TEST_COUNTS",
        final.summary?.unitTests >= 245 &&
          final.summary?.e2eTests >= 21 &&
          final.summary?.cleanStartRuns === 3 &&
          final.summary?.publicDemoBuildReady === true,
        evidence.finalReadiness.path,
        `unit=${final.summary?.unitTests}, e2e=${final.summary?.e2eTests}, clean=${final.summary?.cleanStartRuns}, publicBuild=${final.summary?.publicDemoBuildReady}`,
      ),
    ],
  ),
  criterion(
    "GROWTH",
    "성장성",
    "공급자 독립 계약과 권역 제한을 유지하면서 합성 다기사 관제 규모를 재현한다.",
    [
      check(
        "MULTI_REGION_SCALE",
        mapPerformance.status === "PASSED" &&
          mapPerformance.dataMode === "DEMO" &&
          mapPerformance.profiles?.length === 3 &&
          mapPerformance.profiles.every(({ passed }) => passed) &&
          mapPerformance.budget?.maxTotalCouriers === 240 &&
          mapPerformance.budget?.maxVisibleRegionCouriers === 80 &&
          mapPerformance.budget?.maxRenderedRegionRoutes === 24,
        evidence.mapPerformance.path,
        `profiles=${mapPerformance.profiles?.length}, max=${mapPerformance.budget?.maxTotalCouriers}, region=${mapPerformance.budget?.maxVisibleRegionCouriers}, routes=${mapPerformance.budget?.maxRenderedRegionRoutes}`,
      ),
      check(
        "HONEST_DATA_PROMOTION_BOUNDARY",
        provenance.resolution?.provenanceKind === "MOCK" &&
          provenance.resolution?.publicDataOutcomeClaimAllowed === false &&
          provenance.externalAdapterEvidence?.coverageGate?.runtimeSelection
            ?.status === "FALLBACK" &&
          provenance.externalAdapterEvidence?.coverageGate?.runtimeSelection
            ?.mixedLiveAndDemoFields === false,
        evidence.provenance.path,
        "Incomplete public weather evidence remains isolated from the Safety engine.",
      ),
    ],
  ),
  criterion(
    "EFFECTIVENESS",
    "실효성",
    "폐루프가 자동 재현될 뿐 아니라 관리자와 기사가 핵심 결정·제품 경계를 실제로 이해한다.",
    [
      check(
        "TECHNICAL_CLOSED_LOOP",
        final.status === "PASSED" &&
          final.summary?.riskTransferBoundaries === 23 &&
          final.summary?.decisionWorkflowBoundaries === 30,
        evidence.finalReadiness.path,
        `risk=${final.summary?.riskTransferBoundaries}, workflow=${final.summary?.decisionWorkflowBoundaries}`,
      ),
      check(
        "HUMAN_G5_ROUND3_COMPREHENSION",
        g5Round3Passed,
        g5Round3?.path ?? "MISSING:g5-spatial-comprehension-round3-summary.json",
        g5Round3
          ? `status=${g5Round3.json.status}, reviewers=${g5Round3.json.reviewerCount}, comprehensionPassed=${g5Round3.json.comprehensionPassed}`
          : `Round 2 remains ${g5Round2?.json.status ?? "NOT_RUN"}; independent Round 3 is required after the comprehension redesign.`,
      ),
      check(
        "HUMAN_RIDER_PRODUCT_BOUNDARY",
        riderPassed,
        riderRound2?.path ?? "MISSING:rider-reference-comprehension-round2-summary.json",
        riderRound2
          ? `status=${riderRound2.json.status}, reviewers=${riderRound2.json.reviewerCount}, misconceptions=${riderRound2.json.criticalMisconceptionCount}`
          : `Round 1 remains ${riderRound1?.json.status ?? "NOT_RUN"}; five-person independent Round 2 is required after the product-boundary redesign.`,
      ),
    ],
    true,
  ),
  criterion(
    "VALUE",
    "가치성",
    "기사 권리·개인정보·안전 형평성을 성능과 교환하지 않고 감사 가능한 근거로 보존한다.",
    [
      check(
        "PRIVACY_AND_RIGHTS_APPROVED",
        documents.privacy.approved &&
          documents.product.approved &&
          documents.design.approved,
        `${documents.privacy.path}; ${documents.product.path}; ${documents.design.path}`,
        "Approved privacy, product-rights, and role-aware design contracts.",
      ),
      check(
        "NO_RAW_OR_PERSONAL_DATA",
        provenance.privacy?.personalDataIncluded === false &&
          provenance.privacy?.credentialsIncluded === false &&
          upstageDocuments.results?.every(
            ({ rawDocumentStored, rawOutputStored }) =>
              rawDocumentStored === false && rawOutputStored === false,
          ),
        `${evidence.provenance.path}; ${evidence.upstageDocuments.path}`,
        "No personal data, credentials, raw documents, or raw model outputs are retained in the evaluated evidence.",
      ),
      check(
        "SAFETY_EQUITY_HARD_GATE",
        safeRoute?.hardConstraintViolationCount === 0 &&
          riskTransfer.allPassed === true,
        `${evidence.frozen.path}; ${evidence.riskTransfer.path}`,
        `SafeRoute violations=${safeRoute?.hardConstraintViolationCount}, transfer guard=${riskTransfer.passedCount}/${riskTransfer.totalCaseCount}`,
      ),
    ],
  ),
];

if (criteria.length !== 6) {
  throw new Error(`Expected six judging criteria, received ${criteria.length}`);
}

const failedCriteria = criteria.filter(({ status }) => status === "FAILED");
const pendingCriteria = criteria.filter(
  ({ status }) => status === "HUMAN_VALIDATION_REQUIRED",
);
const status = evaluateGoalCompletionStatus(
  criteria.map(({ status: criterionStatus }) => criterionStatus),
);

const allEvidence = [
  ...Object.values(evidence),
  ...[g5Round1, g5Round2, g5Round3, riderRound1, riderRound2].filter(Boolean),
];
const result = {
  schemaVersion: "saferoute-goal-completion-audit-v1",
  capturedAt: new Date().toISOString(),
  status,
  objective:
    "Domestic-track SafeRoute safety-operations decision layer with bounded Atlan Truck and KBS mobility AI references, reproducible closed-loop evidence, and independent human comprehension gates.",
  criteria,
  summary: {
    criterionCount: criteria.length,
    passedCriterionCount: criteria.filter(({ status }) => status === "PASSED")
      .length,
    humanValidationRequiredCount: pendingCriteria.length,
    failedCriterionCount: failedCriteria.length,
    technicalFinalReadiness: final.status,
    domesticTrackStatus: domesticTrack.status,
    g5EvidenceRound: g5Round3
      ? "ROUND_3"
      : g5Round2
        ? "ROUND_2"
        : g5Round1
          ? "ROUND_1"
          : "NOT_RUN",
    g5Status: g5?.json.status ?? "NOT_RUN",
    riderEvidenceRound: riderRound2
      ? "ROUND_2"
      : riderRound1
        ? "ROUND_1"
        : "NOT_RUN",
    riderStatus: rider?.json.status ?? "NOT_RUN",
  },
  requiredNextEvidence: humanEvidence.requiredNextEvidence,
  evidenceManifest: allEvidence.map(({ path, bytes, sha256: hash }) => ({
    path,
    bytes,
    sha256: hash,
  })),
  approvedDocumentManifest: Object.values(documents).map(
    ({ path, status: documentStatus, approved, bytes, sha256: hash }) => ({
      path,
      status: documentStatus,
      approved,
      bytes,
      sha256: hash,
    }),
  ),
  evaluatorManifest: evaluatorSources,
  explicitLimitations: [
    "Synthetic Demo, Mock, public-weather adapter, and redacted API evidence are not field accident-reduction evidence.",
    "No live GPS, turn-by-turn navigation, dispatch brokerage, sensor, accident detection, automatic rescue, authentication, TMS, or customer delivery is claimed.",
    "A.X Hosted API remains external-auth pending and is not a P0 or final Demo dependency.",
    "Goal completion remains unproven until both independent human comprehension summaries pass their strict contracts.",
  ],
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(
  `GOAL_COMPLETION_AUDIT_${status} criteria=${result.summary.passedCriterionCount}/${result.summary.criterionCount} humanPending=${result.summary.humanValidationRequiredCount} failed=${result.summary.failedCriterionCount}`,
);
console.log(`artifact=${outputPath}`);

if (requireReady && status !== "READY_FOR_FINAL_SUBMISSION") {
  process.exitCode = 1;
}
