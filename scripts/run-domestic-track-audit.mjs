import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(".");
const outputPath = resolve(
  root,
  "artifacts/evals/domestic-track-compliance-latest.json",
);
const capturedAt = new Date().toISOString();

const allowedRuntimeHosts = [
  "api.ax-k1.sktai.qa",
  "api.friendli.ai",
  "api.upstage.ai",
  "apihub.kma.go.kr",
];
const allowedDistributionHosts = ["download.pytorch.org"];
const expectedDomesticModels = [
  "skt/A.X-K1",
  "skt/A.X-4.0-Light",
  "LGAI-EXAONE/K-EXAONE-236B-A23B",
  "solar-pro3",
];
const forbiddenAiPackages = [
  "openai",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "@google/genai",
  "cohere-ai",
  "groq-sdk",
  "ollama",
];
const forbiddenRuntimeSecretNames = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "COHERE_API_KEY",
  "GROQ_API_KEY",
];
const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
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
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createCheck(id, passed, details) {
  return { id, passed, details };
}

function extractHttpsHosts(text) {
  return [
    ...new Set(
      [...text.matchAll(/https:\/\/([A-Za-z0-9.-]+)/g)].map((match) =>
        match[1].toLowerCase(),
      ),
    ),
  ].sort();
}

const trackedFiles = git(["ls-files", "-z"])
  .split("\0")
  .filter(Boolean);
const trackedEnvironmentFiles = trackedFiles.filter(
  (file) => /^\.env(?:\.|$)/.test(file) && file !== ".env.example",
);
const auditScopeFiles = trackedFiles.filter(
  (file) =>
    file === ".env.example" ||
    file === "package.json" ||
    file === "requirements-gpu-runtime.txt" ||
    file.startsWith("src/") ||
    file.startsWith("scripts/"),
);

const auditTexts = [];
for (const file of auditScopeFiles) {
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  auditTexts.push({ file, text: await readFile(resolve(root, file), "utf8") });
}
const combinedAuditText = auditTexts.map(({ text }) => text).join("\n");
const runtimeContractText = auditTexts
  .filter(({ file }) => file !== "scripts/run-domestic-track-audit.mjs")
  .map(({ text }) => text)
  .join("\n");
const runtimeHosts = extractHttpsHosts(combinedAuditText);
const unexpectedRuntimeHosts = runtimeHosts.filter(
  (host) =>
    !allowedRuntimeHosts.includes(host) &&
    !allowedDistributionHosts.includes(host),
);

const packageJson = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const dependencyNames = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
});
const unexpectedAiPackages = dependencyNames.filter((name) =>
  forbiddenAiPackages.includes(name),
);
const forbiddenSecretMatches = forbiddenRuntimeSecretNames.filter((name) =>
  new RegExp(`\\b${name}\\b`).test(runtimeContractText),
);

const providerSource = await readFile(
  resolve(root, "src/evals/domesticAiProvider.ts"),
  "utf8",
);
const upstageSource = await readFile(
  resolve(root, "src/adapters/upstage/live.ts"),
  "utf8",
);
const localModelScripts = (
  await Promise.all(
    [
      "scripts/local-model-smoke.py",
      "scripts/local-model-benchmark.py",
      "scripts/verify-local-model-result.py",
    ].map((file) => readFile(resolve(root, file), "utf8")),
  )
).join("\n");
const committedModelEvidence = (
  await Promise.all(
    [
      "artifacts/evals/upstage-smoke-latest.json",
      "artifacts/evals/domestic-ai-api-smoke-latest.json",
      "artifacts/evals/local-model-manifest.json",
    ].map((file) => readFile(resolve(root, file), "utf8")),
  )
).join("\n");
const modelEvidenceText = [
  providerSource,
  upstageSource,
  localModelScripts,
  committedModelEvidence,
  combinedAuditText,
].join("\n");
const missingDomesticModels = expectedDomesticModels.filter(
  (model) => !modelEvidenceText.includes(model),
);
const providerRegistryExact =
  providerSource.includes('domesticAiProviderIds = ["AX", "EXAONE"]') &&
  providerSource.includes("api.ax-k1.sktai.qa") &&
  providerSource.includes("api.friendli.ai");
const upstageExact = upstageSource.includes(
  "https://api.upstage.ai/v1/chat/completions",
);
const protocolLabelCount = (
  combinedAuditText.match(/OPENAI_CHAT_COMPLETIONS/g) ?? []
).length;

const checks = [
  createCheck(
    "TRACKED_SECRET_ENV_FILES",
    trackedEnvironmentFiles.length === 0,
    trackedEnvironmentFiles.length === 0
      ? "Only .env.example is tracked; local secret files are excluded."
      : `Unexpected tracked environment files: ${trackedEnvironmentFiles.join(", ")}`,
  ),
  createCheck(
    "RUNTIME_HOST_ALLOWLIST",
    unexpectedRuntimeHosts.length === 0,
    unexpectedRuntimeHosts.length === 0
      ? `AI, public-data, and distribution HTTPS hosts are classified: ${runtimeHosts.join(", ")}`
      : `Unexpected runtime hosts: ${unexpectedRuntimeHosts.join(", ")}`,
  ),
  createCheck(
    "DOMESTIC_PROVIDER_REGISTRY",
    providerRegistryExact,
    "The shared text benchmark registry contains only SKT A.X and LG K-EXAONE endpoints.",
  ),
  createCheck(
    "UPSTAGE_ENDPOINT_CONTRACT",
    upstageExact,
    "The explanation adapter is pinned to the official Upstage HTTPS chat endpoint.",
  ),
  createCheck(
    "DOMESTIC_MODEL_EVIDENCE",
    missingDomesticModels.length === 0,
    missingDomesticModels.length === 0
      ? `Expected domestic model identifiers are evidenced: ${expectedDomesticModels.join(", ")}`
      : `Missing model evidence: ${missingDomesticModels.join(", ")}`,
  ),
  createCheck(
    "NON_DOMESTIC_AI_SDKS",
    unexpectedAiPackages.length === 0,
    unexpectedAiPackages.length === 0
      ? "No non-domestic generative AI SDK is installed in package.json."
      : `Unexpected AI SDKs: ${unexpectedAiPackages.join(", ")}`,
  ),
  createCheck(
    "NON_DOMESTIC_AI_SECRET_NAMES",
    forbiddenSecretMatches.length === 0,
    forbiddenSecretMatches.length === 0
      ? "No non-domestic generative AI credential name is present in runtime or evaluation scope."
      : `Unexpected credential names: ${forbiddenSecretMatches.join(", ")}`,
  ),
];

const failedChecks = checks.filter((check) => !check.passed);
const declaredNonRuntimeReferences = [
  {
    path: "SafeRoute_AI_Fable5_Prompt_Pack_KR.md",
    classification: "LEGACY_DEVELOPMENT_REFERENCE",
    submissionDisposition: "EXCLUDE",
    runtimeImported: false,
  },
  {
    path: "artifacts/saferoute-web-demo/",
    classification: "ISOLATED_DESIGN_REFERENCE",
    submissionDisposition: "EXCLUDE_EXTERNAL_PROTOTYPE",
    trackedInMain: false,
    runtimeImported: false,
  },
  {
    path: "scripts/download-hf-model.py",
    reference: "huggingface_hub",
    classification: "DOMESTIC_MODEL_DISTRIBUTION_TOOLING",
    submissionDisposition: "INCLUDE_WITH_EXPLANATION",
    runtimeImported: false,
    domesticModel: "skt/A.X-4.0-Light",
  },
];

const result = {
  schemaVersion: "domestic-track-compliance-v1",
  capturedAt,
  status: failedChecks.length === 0 ? "PASSED" : "FAILED",
  scope: {
    competitionTrack: "DOMESTIC_AI",
    auditedTrackedFileCount: auditScopeFiles.length,
    auditedAreas: [
      "runtime adapters",
      "evaluation scripts",
      "server-only environment contract",
      "JavaScript dependencies",
      "GPU runtime manifest",
    ],
    excludedFromRuntimeConclusion: [
      "developer assistance tools",
      "isolated design prototype",
      "documentation-only historical references",
    ],
  },
  domesticAiUsage: [
    {
      provider: "UPSTAGE",
      model: "solar-pro3",
      role: "validated explanation and document evidence layer",
    },
    {
      provider: "SKT",
      models: ["skt/A.X-K1", "skt/A.X-4.0-Light"],
      role: "common text benchmark and fixed-revision offline generation evaluation",
    },
    {
      provider: "LG_AI_RESEARCH",
      model: "LGAI-EXAONE/K-EXAONE-236B-A23B",
      role: "common text benchmark and counterexample generation evaluation",
    },
    {
      provider: "NC_AI",
      product: "VARCO",
      role: "not integrated; downstream asset use remains out of P0 scope",
    },
  ],
  nonAiExternalInput: {
    provider: "KMA_API_HUB",
    role: "public weather evidence; not a generative AI provider",
  },
  allowedRuntimeHosts,
  allowedDistributionHosts,
  observedRuntimeHosts: runtimeHosts,
  checks,
  declaredNonRuntimeReferences,
  protocolClarification: {
    label: "OPENAI_CHAT_COMPLETIONS",
    occurrences: protocolLabelCount,
    meaning:
      "Wire-format compatibility only. No OpenAI service, model, endpoint, SDK, or credential is used by the product runtime or model evaluation.",
  },
  submissionStatement:
    "SafeRoute AI uses domestic AI providers only in its generative AI runtime and model evaluation. Non-domestic AI models and APIs are not used for product execution, training, or evaluation.",
  limitations: [
    "This audit verifies repository contracts and tracked runtime/evaluation files; it does not certify competition eligibility on behalf of the organizer.",
    "Developer assistance tools are disclosed separately from product runtime AI use.",
    "FriendliAI is used only as the competition-documented serving endpoint for LG K-EXAONE.",
  ],
};

await mkdir(resolve(root, "artifacts/evals"), { recursive: true });
const serialized = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(outputPath, serialized, "utf8");

if (failedChecks.length > 0) {
  console.error(
    `DOMESTIC_TRACK_AUDIT_FAIL failed=${failedChecks.map((check) => check.id).join(",")}`,
  );
  console.error(`artifact=${outputPath}`);
  process.exitCode = 1;
} else {
  console.log(
    `DOMESTIC_TRACK_AUDIT_PASS checks=${checks.length} hosts=${runtimeHosts.length} sha256=${sha256(serialized)}`,
  );
  console.log(`artifact=${outputPath}`);
}
