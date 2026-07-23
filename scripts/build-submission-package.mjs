import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

const root = resolve(".");
const outputDirectory = resolve(root, "artifacts/submission");
const stagingDirectory = resolve(root, "tmp/submission-package");
const pnpmEntry = process.env.npm_execpath;
const allowDirty = process.argv.includes("--allow-dirty");
const diagnostic = process.argv.includes("--diagnostic");

if (!pnpmEntry) throw new Error("pnpm entry point is not available");

function git(args) {
  return execFileSync(
    "git",
    ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "NUL",
        GIT_TERMINAL_PROMPT: "0",
      },
    },
  ).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runPnpm(args) {
  const result = spawnSync(process.execPath, [pnpmEntry, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `pnpm ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const trackedStatus = git(["status", "--porcelain", "--untracked-files=no"]);
if (trackedStatus && !allowDirty) {
  throw new Error(
    "Tracked working tree is dirty. Commit or restore tracked changes before building the final package.",
  );
}

const head = git(["rev-parse", "HEAD"]);
const shortHead = git(["rev-parse", "--short=7", "HEAD"]);
const trackedFiles = git(["ls-files", "-z"])
  .split("\0")
  .filter(Boolean);
const goalCompletionPath = "artifacts/evals/goal-completion-latest.json";
if (!trackedFiles.includes(goalCompletionPath) && !diagnostic) {
  throw new Error(
    "Final goal-completion evidence must be tracked before building a submission package.",
  );
}

const finalReadiness = JSON.parse(
  await readFile(
    resolve(root, "artifacts/evals/final-readiness-latest.json"),
    "utf8",
  ),
);
const domesticTrack = JSON.parse(
  await readFile(
    resolve(root, "artifacts/evals/domestic-track-compliance-latest.json"),
    "utf8",
  ),
);
const goalCompletion = JSON.parse(
  await readFile(
    resolve(root, "artifacts/evals/goal-completion-latest.json"),
    "utf8",
  ),
);
if (finalReadiness.status !== "PASSED") {
  throw new Error("Final readiness evidence is not PASSED");
}
if (domesticTrack.status !== "PASSED") {
  throw new Error("Domestic AI track evidence is not PASSED");
}
if (
  goalCompletion.status !== "READY_FOR_FINAL_SUBMISSION" &&
  !diagnostic
) {
  throw new Error(
    `Goal completion is ${goalCompletion.status}. Complete the required human evidence or use --diagnostic for a clearly labeled non-submission archive.`,
  );
}

const rootFiles = new Set([
  ".env.example",
  ".openai/hosting.json",
  "AGENTS.md",
  "README.md",
  "index.html",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "requirements-gpu-runtime.txt",
  "tsconfig.json",
  "vite.config.ts",
]);
const approvedDocuments = new Set([
  "docs/architecture.md",
  "docs/data-contracts.md",
  "docs/decisions.md",
  "docs/demo-script.md",
  "docs/design-system.md",
  "docs/domestic-ai-track-compliance.md",
  "docs/evals.md",
  "docs/final-readiness.md",
  "docs/g5-spatial-visualization-design.md",
  "docs/g5-spatial-comprehension-test.md",
  "docs/geospatial-pwa-implementation-plan.md",
  "docs/goal-completion-audit.md",
  "docs/intervention-policy.md",
  "docs/privacy-and-ai-policy.md",
  "docs/product-spec.md",
  "docs/rider-reference-comprehension-test.md",
  "docs/safety-model.md",
  "docs/submission-package.md",
]);
const latestEvidenceFiles = new Set([
  "artifacts/evals/accessibility-summary.json",
  "artifacts/evals/baseline-comparison.csv",
  "artifacts/evals/data-provenance-audit.json",
  "artifacts/evals/decision-workflow-boundaries.csv",
  "artifacts/evals/decision-workflow-boundary-summary.json",
  "artifacts/evals/domestic-ai-api-smoke-latest.csv",
  "artifacts/evals/domestic-ai-api-smoke-latest.json",
  "artifacts/evals/domestic-ai-api-runs/2026-07-17T11-37-10-732Z-live-exaone/domestic-ai-api-smoke-latest.csv",
  "artifacts/evals/domestic-ai-api-runs/2026-07-17T11-37-10-732Z-live-exaone/domestic-ai-api-smoke-latest.json",
  "artifacts/evals/domestic-ai-api-runs/2026-07-21T12-00-06-856Z-live-ax/domestic-ai-api-smoke-latest.csv",
  "artifacts/evals/domestic-ai-api-runs/2026-07-21T12-00-06-856Z-live-ax/domestic-ai-api-smoke-latest.json",
  "artifacts/evals/domestic-ai-api-runs/2026-07-23T11-08-49-486Z-live-ax/domestic-ai-api-smoke-latest.csv",
  "artifacts/evals/domestic-ai-api-runs/2026-07-23T11-08-49-486Z-live-ax/domestic-ai-api-smoke-latest.json",
  "artifacts/evals/domestic-ai-smoke.csv",
  "artifacts/evals/domestic-track-compliance-latest.json",
  "artifacts/evals/final-readiness-latest.json",
  "artifacts/evals/frozen-benchmark-summary.json",
  "artifacts/evals/frozen-variant-results.csv",
  "artifacts/evals/goal-completion-latest.json",
  "artifacts/evals/g5-spatial-comprehension-input.template.json",
  "artifacts/evals/g5-spatial-comprehension-results.json",
  "artifacts/evals/g5-spatial-comprehension-summary.json",
  "artifacts/evals/g5-spatial-comprehension-round2-results.json",
  "artifacts/evals/g5-spatial-comprehension-round2-summary.json",
  "artifacts/evals/g5-spatial-comprehension-round3-results.json",
  "artifacts/evals/g5-spatial-comprehension-round3-summary.json",
  "artifacts/evals/g5-spatial-comprehension-round4-results.json",
  "artifacts/evals/g5-spatial-comprehension-round4-summary.json",
  "artifacts/evals/g5-spatial-comprehension-evidence.json",
  "artifacts/evals/g5-spatial-stimulus-manifest.json",
  "artifacts/evals/g5-spatial-round2-stimulus-manifest.json",
  "artifacts/evals/g5-spatial-round3-stimulus-manifest.json",
  "artifacts/evals/g5-spatial-round4-stimulus-manifest.json",
  "artifacts/evals/local-model-manifest.json",
  "artifacts/evals/map-performance-summary.json",
  "artifacts/evals/risk-transfer-boundaries.csv",
  "artifacts/evals/risk-transfer-boundary-summary.json",
  "artifacts/evals/rider-reference-comprehension-summary.json",
  "artifacts/evals/rider-reference-comprehension-round2-summary.json",
  "artifacts/evals/rider-reference-stimulus-manifest.json",
  "artifacts/evals/rider-reference-round2-stimulus-manifest.json",
  "artifacts/evals/run-manifest.json",
  "artifacts/evals/scenario-results.csv",
  "artifacts/evals/spatial-scene-summary.json",
  "artifacts/evals/unit-summary.json",
  "artifacts/evals/upstage-roundtrip.csv",
  "artifacts/evals/upstage-document-roundtrip-mock-latest.csv",
  "artifacts/evals/upstage-document-roundtrip-mock-latest.json",
  "artifacts/evals/upstage-smoke-latest.csv",
  "artifacts/evals/upstage-smoke-latest.json",
  "artifacts/evals/weather-runtime-selection-latest.json",
]);
const sourcePrefixes = ["e2e/", "fixtures/", "scripts/", "src/", "tests/", "tools/"];
const screenshotPrefix = "artifacts/evals/screenshots/";
const scannableExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function latestTrackedRunPrefix(parentPrefix) {
  const directories = trackedFiles
    .filter((file) => file.startsWith(parentPrefix))
    .map((file) => file.slice(parentPrefix.length).split("/")[0])
    .filter(Boolean)
    .sort();
  const latest = directories.at(-1);
  if (!latest) throw new Error(`No tracked run found under ${parentPrefix}`);
  return `${parentPrefix}${latest}/`;
}

const latestCoreRunPrefix = latestTrackedRunPrefix(
  "artifacts/evals/core-evidence-runs/",
);
const latestFinalRunPrefix = latestTrackedRunPrefix(
  "artifacts/evals/final-readiness-runs/",
);
const includedFiles = trackedFiles.filter(
  (file) =>
    rootFiles.has(file) ||
    approvedDocuments.has(file) ||
    latestEvidenceFiles.has(file) ||
    sourcePrefixes.some((prefix) => file.startsWith(prefix)) ||
    file.startsWith(screenshotPrefix) ||
    file.startsWith(latestCoreRunPrefix) ||
    file.startsWith(latestFinalRunPrefix),
);
if (diagnostic && !includedFiles.includes(goalCompletionPath)) {
  includedFiles.push(goalCompletionPath);
}

const explicitExclusions = [
  "SafeRoute_AI_Final_Strategy_Design_Manual_KR.pdf",
  "artifacts/saferoute-web-demo/",
  "artifacts/saferoute-web-demo-site.tar.gz",
  "artifacts/saferoute-web-demo-site-v2.tar.gz",
  ".env.local",
  "node_modules/",
  "playwright-report/",
  "test-results/",
];
for (const excluded of explicitExclusions) {
  if (
    includedFiles.some(
      (file) => file === excluded || file.startsWith(excluded),
    )
  ) {
    throw new Error(`Excluded path entered submission set: ${excluded}`);
  }
}

const sensitiveFindings = [];
for (const file of includedFiles) {
  const extension = file.includes(".")
    ? `.${file.split(".").at(-1).toLowerCase()}`
    : "";
  if (!scannableExtensions.has(extension)) continue;
  const text = await readFile(resolve(root, file), "utf8");
  const directPatterns = [
    {
      id: "OPENAI_STYLE_SECRET",
      pattern: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}/g,
    },
    { id: "GOOGLE_STYLE_SECRET", pattern: /AIza[0-9A-Za-z_-]{20,}/g },
    { id: "AWS_ACCESS_KEY", pattern: /AKIA[0-9A-Z]{16}/g },
    {
      id: "PRIVATE_KEY",
      pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    },
    { id: "LOCAL_WINDOWS_PATH", pattern: /C:\\Users\\khiyw/gi },
    { id: "GPU_HOME_PATH", pattern: /\/home\/tta/gi },
    {
      id: "GPU_HOST",
      pattern: new RegExp(["rookie", "s55"].join("-"), "gi"),
    },
    {
      id: "SSH_ENV_SIGNATURE",
      pattern: new RegExp(["SSH", "CONNECTION"].join("_"), "gi"),
    },
  ];
  for (const { id, pattern } of directPatterns) {
    if (pattern.test(text)) sensitiveFindings.push({ file, id });
  }
  for (const match of text.matchAll(/Bearer\s+([A-Za-z0-9._-]{16,})/gi)) {
    const token = match[1].toLowerCase();
    if (!/(?:test|fake|not_a_real|placeholder|example)/.test(token)) {
      sensitiveFindings.push({ file, id: "BEARER_TOKEN" });
    }
  }
}
if (sensitiveFindings.length > 0) {
  throw new Error(
    `Sensitive or local identity signatures entered submission set: ${sensitiveFindings
      .map((finding) => `${finding.id}:${finding.file}`)
      .join(", ")}`,
  );
}

await rm(stagingDirectory, { recursive: true, force: true });
await mkdir(stagingDirectory, { recursive: true });
for (const file of includedFiles) {
  const destination = resolve(stagingDirectory, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, file), destination);
}

runPnpm(["run", "build"]);
await cp(resolve(root, "dist"), resolve(stagingDirectory, "demo-dist"), {
  recursive: true,
});

const packageReadme = `# SafeRoute AI 국내 AI 트랙 제출 패키지

- Git commit: ${head}
- 최종 릴리스 게이트: ${finalReadiness.status}
- 국내 AI 트랙 감사: ${domesticTrack.status}
- 최종 GOAL 감사: ${goalCompletion.status}
- 패키지 구분: ${diagnostic ? "DIAGNOSTIC_ONLY" : "FINAL_SUBMISSION_CANDIDATE"}
- 데이터: 합성 Demo fixture, 공개 날씨 증거, 비식별 AI 평가 요약

## 실행

\`\`\`powershell
pnpm install --frozen-lockfile
pnpm run verify:final
pnpm run dev
\`\`\`

\`demo-dist/\`는 같은 commit에서 생성한 정적 빌드다. 실제 기사 개인정보, 실제 TMS·지도·인증·고객 발송은 포함하지 않는다.

## 명시적 제외

- 격리형 ChatGPT 디자인 프로토타입과 압축파일
- 로컬 API 키와 \`.env.local\`
- \`node_modules\`, 테스트 리포트와 이전 중복 평가 run

OpenAI-compatible 표기는 통신 형식 이름이며 OpenAI 모델·서비스 사용을 의미하지 않는다.
`;
await writeFile(
  resolve(stagingDirectory, "SUBMISSION_README.md"),
  packageReadme,
  "utf8",
);

const stagedFilesBeforeManifest = await listFiles(stagingDirectory);
const manifestEntries = [];
for (const file of stagedFilesBeforeManifest) {
  const bytes = await readFile(file);
  manifestEntries.push({
    file: relative(stagingDirectory, file).replaceAll("\\", "/"),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  });
}
manifestEntries.sort((left, right) => left.file.localeCompare(right.file));
const submissionManifest = {
  schemaVersion: "saferoute-submission-package-v1",
  capturedAt: new Date().toISOString(),
  gitCommit: head,
  finalReadinessStatus: finalReadiness.status,
  domesticTrackStatus: domesticTrack.status,
  goalCompletionStatus: goalCompletion.status,
  diagnosticOnly: diagnostic,
  includedFileCount: manifestEntries.length,
  includedBytes: manifestEntries.reduce((total, item) => total + item.bytes, 0),
  latestCoreRun: latestCoreRunPrefix.slice(0, -1),
  latestFinalRun: latestFinalRunPrefix.slice(0, -1),
  explicitExclusions,
  credentialsIncluded: false,
  realPersonalDataIncluded: false,
  secretAndIdentityScanPassed: true,
  entries: manifestEntries,
};
await writeFile(
  resolve(stagingDirectory, "submission-manifest.json"),
  `${JSON.stringify(submissionManifest, null, 2)}\n`,
  "utf8",
);

await mkdir(outputDirectory, { recursive: true });
const archiveName = diagnostic
  ? `saferoute-ai-diagnostic-${shortHead}.zip`
  : `saferoute-ai-domestic-track-${shortHead}.zip`;
const archivePath = resolve(outputDirectory, archiveName);
await rm(archivePath, { force: true });
const powershellScript = [
  `$source = '${stagingDirectory.replaceAll("'", "''")}\\*'`,
  `$destination = '${archivePath.replaceAll("'", "''")}'`,
  "Compress-Archive -Path $source -DestinationPath $destination -CompressionLevel Optimal -Force",
].join("; ");
const archiveResult = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-Command", powershellScript],
  { cwd: root, encoding: "utf8", shell: false, timeout: 120_000 },
);
if (archiveResult.status !== 0) {
  throw new Error(
    `Compress-Archive failed\n${archiveResult.stdout ?? ""}\n${archiveResult.stderr ?? ""}`,
  );
}
const archiveBytes = await readFile(archivePath);
const archiveSummary = {
  schemaVersion: "saferoute-submission-archive-summary-v1",
  capturedAt: submissionManifest.capturedAt,
  gitCommit: head,
  archive: archiveName,
  bytes: archiveBytes.byteLength,
  sha256: sha256(archiveBytes),
  includedFileCount: submissionManifest.includedFileCount + 1,
  finalReadinessStatus: finalReadiness.status,
  domesticTrackStatus: domesticTrack.status,
  goalCompletionStatus: goalCompletion.status,
  diagnosticOnly: diagnostic,
  explicitExclusions,
  secretAndIdentityScanPassed: true,
};
await writeFile(
  resolve(outputDirectory, "submission-package-latest.json"),
  `${JSON.stringify(archiveSummary, null, 2)}\n`,
  "utf8",
);

const archiveStats = await stat(archivePath);
console.log(
  `${diagnostic ? "SUBMISSION_DIAGNOSTIC_PASS" : "SUBMISSION_PACKAGE_PASS"} commit=${shortHead} files=${archiveSummary.includedFileCount} ` +
    `bytes=${archiveStats.size} sha256=${archiveSummary.sha256}`,
);
console.log(`archive=${archivePath}`);
console.log(
  `manifest=${resolve(outputDirectory, "submission-package-latest.json")}`,
);
