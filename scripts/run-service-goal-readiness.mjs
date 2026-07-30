import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(".");
const pnpm = "pnpm";
const outputDirectory = resolve(root, "artifacts/evals");
await mkdir(outputDirectory, { recursive: true });

async function run(id, args) {
  const startedAt = Date.now();
  const executable =
    process.platform === "win32"
      ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
      : pnpm;
  const executableArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", pnpm, ...args]
      : args;
  const child = spawn(executable, executableArgs, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });
  const exitCode = await new Promise((resolveCode) =>
    child.on("close", resolveCode),
  );
  return {
    id,
    command: `pnpm ${args.join(" ")}`,
    exitCode,
    passed: exitCode === 0,
    durationMs: Date.now() - startedAt,
    summary:
      stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-3)
        .join(" | ") ||
      stderr
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-3)
        .join(" | "),
  };
}

const commands = [];
for (const [id, args] of [
  ["TYPECHECK", ["run", "typecheck"]],
  ["UNIT_CONTRACT", ["run", "test"]],
  ["FULL_E2E", ["run", "test:e2e"]],
  ["OPERATIONS_SCALE", ["run", "eval:operations:scale"]],
  ["OPERATIONS_EVIDENCE", ["run", "eval:operations:evidence"]],
  ["PRODUCTION_BUILD", ["run", "build"]],
]) {
  commands.push(await run(id, args));
}

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const evidence = {
  service: await json("artifacts/evals/operations-service-evidence.json"),
  scale: await json("artifacts/evals/operations-scale-summary.json"),
  upstage: await json("artifacts/evals/upstage-smoke-latest.json"),
  upstageDocuments: await json(
    "artifacts/evals/upstage-operations-document-live-latest.json",
  ),
  kakao: await json("artifacts/evals/kakao-directions-smoke-latest.json"),
  human: await json(
    "artifacts/evals/operations-human-review-summary.json",
  ),
  humanStudy: await json(
    "dist/client/tools/operations-service-review/study-manifest.json",
  ),
  deployed: await json(
    "artifacts/evals/operations-deployed-smoke-latest.json",
  ),
  hosting: await json(".openai/hosting.json"),
};

const checks = {
  automatedCommands: commands.every((command) => command.passed),
  fullOperationsDay:
    evidence.service.status === "PASSED" &&
    evidence.service.inputKind === "DOCUMENT_BUNDLE" &&
    evidence.service.sourceDocumentCount === 100 &&
    evidence.service.rawDocumentPersisted === false &&
    evidence.service.activeCourierCount === 25 &&
    evidence.service.supportDecisionCount > 1 &&
    evidence.service.initializedDecisionCount ===
      evidence.service.supportDecisionCount,
  safetyIntegrity:
    evidence.service.unsafeRecommendedCount === 0 &&
    evidence.service.conflictCount > 0 &&
    evidence.service.applyStatus === "APPLIED" &&
    evidence.service.completedDecisionStatus === "NOTICE_RECORDED" &&
    evidence.service.customerNoticeDraftCount > 0 &&
    evidence.service.customerNoticeDraftCount ===
      evidence.service.unsentCustomerNoticeDraftCount &&
    evidence.service.customerNoticeDraftCount ===
      evidence.service.exportedCustomerNoticeCount &&
    evidence.service.customerNoticeEtaMismatchCount === 0 &&
    evidence.service.comparisonEvidencePresent === true,
  scale:
    evidence.scale.status === "PASSED" &&
    [24, 96, 240].every((count) =>
      evidence.scale.profiles.some(
        (profile) =>
          profile.courierCount === count && profile.passed === true,
      ),
    ),
  upstageLive:
    evidence.upstage.status === "COMPLETED" &&
    evidence.upstage.run.providerMode === "LIVE" &&
    evidence.upstage.run.metrics.passed ===
      evidence.upstage.run.taskCount &&
    evidence.upstage.run.metrics.failed === 0,
  upstageDocumentLive:
    evidence.upstageDocuments.status === "LIVE_PASS" &&
    evidence.upstageDocuments.networkRequestPerformed === true &&
    evidence.upstageDocuments.parse?.markerCoverageComplete === true &&
    evidence.upstageDocuments.extraction?.exactMatch === true &&
    evidence.upstageDocuments.rawProviderResponseStored === false,
  kakaoLive:
    evidence.kakao.status === "LIVE" &&
    evidence.kakao.httpStatus === 200 &&
    evidence.kakao.pathPointCount >= 2 &&
    evidence.kakao.safetyEngineInputApproved === false,
  persistence:
    evidence.hosting.d1 === "DB" &&
    (
      await readFile(
        resolve(root, "server/operations-session-store.mjs"),
        "utf8",
      )
    ).includes("SESSION_CONFLICT"),
  deployedService:
    evidence.deployed.status === "LIVE_PASS" &&
    evidence.deployed.networkRequestPerformed === true &&
    evidence.deployed.storage === "D1" &&
    evidence.deployed.restored === true &&
    evidence.deployed.conflictProtected === true &&
    evidence.deployed.upstageExplanationLive === true &&
    evidence.deployed.publicReviewManifestVerified === true &&
    evidence.deployed.deployedReleaseCommit ===
      evidence.humanStudy.releaseCommit &&
    evidence.deployed.reviewManifestSha256 ===
      evidence.humanStudy.manifestSha256 &&
    evidence.deployed.actualPersonalDataCount === 0,
  roleSeparation:
    (
      await readFile(
        resolve(root, "src/ui/OperationsRiderService.tsx"),
        "utf8",
      )
    ).includes("불이익 없이 현재 계획을 유지") &&
    (
      await readFile(
        resolve(root, "src/ui/OperationsService.tsx"),
        "utf8",
      )
    ).includes("기사 화면 열기"),
  human:
    evidence.human.status === "PASSED" &&
    evidence.human.releaseCommit === evidence.humanStudy.releaseCommit &&
    evidence.human.studyManifestSha256 === evidence.humanStudy.manifestSha256 &&
    evidence.human.adminReviewerCount >= 3 &&
    evidence.human.riderReviewerCount >= 5 &&
    evidence.human.criticalMisconceptionCount === 0,
};

const criteria = [
  {
    id: "CREATIVITY",
    nameKo: "창의성",
    passed: checks.fullOperationsDay,
    evidence: [
      "artifacts/evals/operations-service-evidence.json",
      "docs/service-goal-2026-08-14.md",
    ],
  },
  {
    id: "INNOVATION",
    nameKo: "혁신성",
    passed: checks.safetyIntegrity,
    evidence: [
      "artifacts/evals/operations-service-evidence.json",
      "tests/operations-service.test.ts",
    ],
  },
  {
    id: "EXECUTION",
    nameKo: "추진성",
    passed:
      checks.automatedCommands &&
      checks.persistence &&
      checks.deployedService &&
      checks.upstageLive &&
      checks.upstageDocumentLive &&
      checks.kakaoLive,
    evidence: [
      "artifacts/evals/upstage-smoke-latest.json",
      "artifacts/evals/upstage-operations-document-live-latest.json",
      "artifacts/evals/kakao-directions-smoke-latest.json",
      ".openai/hosting.json",
      "artifacts/evals/operations-deployed-smoke-latest.json",
    ],
  },
  {
    id: "GROWTH",
    nameKo: "성장성",
    passed: checks.scale,
    evidence: ["artifacts/evals/operations-scale-summary.json"],
  },
  {
    id: "EFFECTIVENESS",
    nameKo: "실효성",
    passed:
      checks.fullOperationsDay &&
      checks.roleSeparation &&
      commands.find((command) => command.id === "FULL_E2E")?.passed ===
        true,
    evidence: [
      "e2e/operations-service.spec.ts",
      "e2e/operations-rider.spec.ts",
      "artifacts/evals/operations-service-evidence.json",
    ],
  },
  {
    id: "VALUE",
    nameKo: "가치성",
    passed: checks.human,
    status: checks.human ? "PASSED" : "HUMAN_VALIDATION_REQUIRED",
    evidence: [
      "artifacts/evals/operations-human-review-summary.json",
      "tools/operations-service-review/index.html",
      "docs/operations-service-human-review.md",
    ],
  },
];

const manifestPaths = [
  "docs/service-goal-2026-08-14.md",
  "docs/product-spec.md",
  "docs/data-contracts.md",
  "docs/architecture.md",
  "docs/evals.md",
  "docs/operations-service-human-review.md",
  "docs/decisions.md",
  "artifacts/evals/operations-service-evidence.json",
  "artifacts/evals/operations-scale-summary.json",
  "artifacts/evals/upstage-smoke-latest.json",
  "artifacts/evals/upstage-operations-document-live-latest.json",
  "output/pdf/upstage-synthetic-operations-document-fixture.pdf",
  "artifacts/evals/kakao-directions-smoke-latest.json",
  "artifacts/evals/operations-human-review-summary.json",
  "artifacts/evals/operations-human-review-study-manifest.json",
  "artifacts/evals/operations-deployed-smoke-latest.json",
  ...Object.values(evidence.human.stimulusSha256 ?? {}).map(
    (hash) => `artifacts/evals/human-review-stimuli/${hash}.png`,
  ),
  "artifacts/evals/screenshots/operations-service-1440x900.png",
  "artifacts/evals/screenshots/operations-service-1280x720.png",
  "artifacts/evals/screenshots/operations-rider-390x844.png",
  "artifacts/evals/screenshots/operations-rider-360x800.png",
  "e2e/operations-service.spec.ts",
  "e2e/operations-accessibility.spec.ts",
  "e2e/operations-rider.spec.ts",
];
const manifest = [];
for (const path of manifestPaths) {
  const bytes = await readFile(resolve(root, path));
  const fileStat = await stat(resolve(root, path));
  manifest.push({
    path,
    bytes: fileStat.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const automatedPassed = Object.entries(checks)
  .filter(
    ([name]) =>
      name !== "human" &&
      name !== "upstageDocumentLive" &&
      name !== "deployedService",
  )
  .every(([, passed]) => passed);
const status = !automatedPassed
  ? "FAILED"
  : !checks.upstageDocumentLive
    ? "EXTERNAL_API_VALIDATION_REQUIRED"
    : !checks.deployedService
      ? "DEPLOYMENT_VALIDATION_REQUIRED"
    : checks.human
      ? "PASSED"
      : "HUMAN_VALIDATION_REQUIRED";
const result = {
  schemaVersion: "service-goal-readiness-v1",
  goal: "PAID_PILOT_READY_WITH_SYNTHETIC_OPERATIONS",
  capturedAt: new Date().toISOString(),
  status,
  dataMode: "SYNTHETIC",
  commands,
  checks,
  criteria,
  blocker:
    status === "EXTERNAL_API_VALIDATION_REQUIRED"
      ? {
          code: "UPSTAGE_DOCUMENT_PARSE_LIVE_NOT_COMPLETE",
          currentStatus: evidence.upstageDocuments.status,
          command: "pnpm run eval:upstage:operations-documents:live",
          paidApiApprovalRequired: true,
          humanReviewAlsoPending: {
            admin: `${evidence.human.adminReviewerCount}/3`,
            rider: `${evidence.human.riderReviewerCount}/5`,
          },
        }
      : status === "DEPLOYMENT_VALIDATION_REQUIRED"
        ? {
            code: "PRODUCTION_D1_RUNTIME_NOT_VERIFIED",
            currentStatus: evidence.deployed.status,
            command: "pnpm run eval:operations:deployed:live",
            siteUrl: evidence.deployed.siteUrl,
          }
      : status === "HUMAN_VALIDATION_REQUIRED"
        ? {
          code: "INDEPENDENT_HUMAN_REVIEW_NOT_COMPLETE",
          admin: `${evidence.human.adminReviewerCount}/3`,
          rider: `${evidence.human.riderReviewerCount}/5`,
          reviewPath: "/tools/operations-service-review/",
        }
        : undefined,
  limitations: [
    "No actual courier, customer, precise GPS, biometric, or private TMS data is processed.",
    "No actual authentication, customer message delivery, or field accident-reduction claim is included.",
    "Kakao and Upstage receive deterministic synthetic or schema-validated decision facts only.",
  ],
};
await writeFile(
  resolve(outputDirectory, "service-goal-readiness-latest.json"),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(outputDirectory, "service-goal-evidence-manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: "service-goal-evidence-manifest-v1",
      capturedAt: result.capturedAt,
      goal: result.goal,
      dataMode: result.dataMode,
      credentialsStored: false,
      rawProviderResponsesStored: false,
      artifacts: manifest,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(
  `SERVICE_GOAL_READINESS_${status} automated=${automatedPassed} human=${checks.human}`,
);
if (status === "FAILED") process.exitCode = 1;
if (status === "HUMAN_VALIDATION_REQUIRED") process.exitCode = 2;
if (status === "EXTERNAL_API_VALIDATION_REQUIRED") process.exitCode = 3;
if (status === "DEPLOYMENT_VALIDATION_REQUIRED") process.exitCode = 4;
