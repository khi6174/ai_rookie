import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";

const root = process.cwd();
const live = process.argv.includes("--live");
const check = process.argv.includes("--check");
if (live === check) {
  throw new Error("Choose exactly one mode: --check or --live");
}
const siteUrl = String(
  process.env.SAFEROUTE_SITE_URL ??
    "https://saferoute-ai-demo.khiyw.chatgpt.site",
).replace(/\/+$/, "");
const parsedSite = new URL(siteUrl);
if (
  parsedSite.protocol !== "https:" ||
  !parsedSite.hostname.endsWith(".khiyw.chatgpt.site")
) {
  throw new Error("Deployed smoke accepts only the approved Sites HTTPS host");
}
const workspaceId =
  "operations-workspace-00000000-0000-4000-8000-000000000617";
const endpoint = `${siteUrl}/api/operations/sessions/${workspaceId}`;
const explanationEndpoint = `${siteUrl}/api/upstage-explanation`;
const reviewManifestEndpoint =
  `${siteUrl}/tools/operations-service-review/study-manifest.json`;
const outputDirectory = path.join(root, "artifacts", "evals");
const outputPath = path.join(
  outputDirectory,
  "operations-deployed-smoke-latest.json",
);
await mkdir(outputDirectory, { recursive: true });

if (check) {
  const artifact = {
    schemaVersion: "operations-deployed-smoke-v1",
    capturedAt: new Date().toISOString(),
    status: "NOT_RUN",
    dataMode: "SYNTHETIC",
    siteUrl,
    workspaceId,
    networkRequestPerformed: false,
    limitation: "Production D1 and runtime routes were not called in --check mode.",
  };
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log("OPERATIONS_DEPLOYED_SMOKE_NOT_RUN network=false");
  console.log(`JSON: ${outputPath}`);
  process.exit();
}

const vite = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});
try {
  const fixtures = await vite.ssrLoadModule(
    "/src/adapters/fixtures/syntheticOperationsPackage.ts",
  );
  const operations = await vite.ssrLoadModule(
    "/src/application/operations/index.ts",
  );
  const snapshot = await operations.createDailyOperationsSnapshot(
    fixtures.bundledDailyOperationsPackage,
    { createdAt: new Date().toISOString() },
  );
  const fleet = operations.evaluateOperationsFleet(snapshot);
  const workspace = operations.createOperationsDecisionWorkspace(
    snapshot,
    fleet,
  );
  const existingResponse = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  const existingBody = await existingResponse.json().catch(() => ({}));
  if (![200, 404].includes(existingResponse.status)) {
    throw new Error(`INITIAL_GET_${existingResponse.status}`);
  }
  const savedAt = new Date().toISOString();
  const session = operations.createOperationsPersistedSession({
    workspaceId,
    savedAt,
    operationsPackage: fixtures.bundledDailyOperationsPackage,
    snapshot,
    fleet,
    workspace,
  });
  const saveResponse = await fetch(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(existingResponse.status === 200
        ? {
            "X-SafeRoute-Base-Saved-At": existingBody.updatedAt,
          }
        : {}),
    },
    body: JSON.stringify(session),
  });
  const saveBody = await saveResponse.json().catch(() => ({}));
  const loadResponse = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  const loadBody = await loadResponse.json().catch(() => ({}));
  const staleResponse = await fetch(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-SafeRoute-Base-Saved-At": "2000-01-01T00:00:00.000Z",
    },
    body: JSON.stringify({
      ...session,
      savedAt: new Date(Date.now() + 1_000).toISOString(),
    }),
  });
  const staleBody = await staleResponse.json().catch(() => ({}));
  const explanationInput = {
    requestId: "operations-explanation-deployed-smoke-000000000617",
    role: "ADMIN",
    language: "ko",
    dataMode: "DEMO",
    numericFacts: [
      {
        factId: "current-budget",
        label: "현재 안전여유",
        value: 52.1,
        unit: "budget_points",
        displayValue: "52.1",
      },
      {
        factId: "minimum-budget",
        label: "조정 후 최저",
        value: 54,
        unit: "budget_points",
        displayValue: "54.0",
      },
    ],
    stateFacts: [
      {
        factId: "decision-state",
        label: "결정 상태",
        value: "기사 응답 대기",
      },
    ],
    allowedCitations: [],
    allowedActions: ["기사 동의 상태 확인"],
    prohibitedTopics: ["기사 평가", "징계", "사고확률"],
  };
  const explanationResponse = await fetch(explanationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(explanationInput),
  });
  const explanationBody = await explanationResponse
    .json()
    .catch(() => ({}));
  const reviewManifestUrl = new URL(reviewManifestEndpoint);
  reviewManifestUrl.searchParams.set("release-check", Date.now().toString());
  const reviewManifestResponse = await fetch(reviewManifestUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
  });
  const reviewManifestBody = await reviewManifestResponse
    .json()
    .catch(() => ({}));
  const reviewManifestCore = {
    schemaVersion: reviewManifestBody.schemaVersion,
    studyId: reviewManifestBody.studyId,
    dataMode: reviewManifestBody.dataMode,
    development: reviewManifestBody.development,
    releaseCommit: reviewManifestBody.releaseCommit,
    stimuli: reviewManifestBody.stimuli,
  };
  const computedReviewManifestSha256 = createHash("sha256")
    .update(JSON.stringify(reviewManifestCore))
    .digest("hex");
  const reviewManifestContentType =
    reviewManifestResponse.headers.get("content-type") ?? "";
  const publicReviewManifestVerified =
    reviewManifestResponse.status === 200 &&
    reviewManifestContentType.includes("application/json") &&
    reviewManifestBody.schemaVersion ===
      "operations-service-human-review-study-manifest-v1" &&
    reviewManifestBody.studyId === "operations-service-human-review-v1" &&
    reviewManifestBody.dataMode === "SYNTHETIC" &&
    reviewManifestBody.development === false &&
    /^[0-9a-f]{40}$/.test(reviewManifestBody.releaseCommit ?? "") &&
    ["ADMIN", "RIDER"].every((role) =>
      /^[0-9a-f]{64}$/.test(
        reviewManifestBody.stimuli?.[role]?.sha256 ?? "",
      ),
    ) &&
    reviewManifestBody.manifestSha256 === computedReviewManifestSha256;
  const restored =
    loadResponse.status === 200 &&
    loadBody.storage === "D1" &&
    loadBody.session?.snapshotIdentity?.snapshotId === snapshot.snapshotId &&
    loadBody.session?.workspace?.supportQueue?.length ===
      fleet.supportQueue.length;
  const conflictProtected =
    staleResponse.status === 409 &&
    staleBody.code === "SESSION_CONFLICT";
  const upstageExplanationLive =
    explanationResponse.status === 200 &&
    explanationBody.status === "LIVE" &&
    explanationBody.provider === "UPSTAGE" &&
    explanationBody.model === "solar-pro3" &&
    explanationBody.output?.requestId === explanationInput.requestId &&
    explanationBody.output?.role === explanationInput.role &&
    explanationBody.output?.dataModeLabel === "Demo fixture";
  const passed =
    saveResponse.status === 200 &&
    saveBody.storage === "D1" &&
    restored &&
    conflictProtected &&
    upstageExplanationLive &&
    publicReviewManifestVerified;
  const artifact = {
    schemaVersion: "operations-deployed-smoke-v1",
    capturedAt: new Date().toISOString(),
    status: passed ? "LIVE_PASS" : "LIVE_FAIL",
    dataMode: "SYNTHETIC",
    siteUrl,
    workspaceId,
    networkRequestPerformed: true,
    initialGetStatus: existingResponse.status,
    saveStatus: saveResponse.status,
    loadStatus: loadResponse.status,
    staleWriteStatus: staleResponse.status,
    explanationStatus: explanationResponse.status,
    reviewManifestStatus: reviewManifestResponse.status,
    reviewManifestContentType,
    storage: saveBody.storage,
    restored,
    conflictProtected,
    upstageExplanationLive,
    publicReviewManifestVerified,
    deployedReleaseCommit: reviewManifestBody.releaseCommit,
    reviewManifestSha256: reviewManifestBody.manifestSha256,
    upstageExplanationOutputSha256:
      explanationBody.output === undefined
        ? undefined
        : createHash("sha256")
            .update(JSON.stringify(explanationBody.output))
            .digest("hex"),
    snapshotId: snapshot.snapshotId,
    packageHash: snapshot.packageHash,
    supportDecisionCount: fleet.supportDecisionCount,
    persistedPayloadSha256: createHash("sha256")
      .update(JSON.stringify(session))
      .digest("hex"),
    rawSessionStoredInEvidence: false,
    actualPersonalDataCount: 0,
  };
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(
    `OPERATIONS_DEPLOYED_SMOKE_${artifact.status} storage=${artifact.storage ?? "NONE"} conflict=${conflictProtected} upstage=${upstageExplanationLive} review=${publicReviewManifestVerified}`,
  );
  console.log(`JSON: ${outputPath}`);
  if (!passed) process.exitCode = 1;
} finally {
  await vite.close();
}
