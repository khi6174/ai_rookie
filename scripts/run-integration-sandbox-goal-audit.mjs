import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(".");
const outputPath = resolve(root, "artifacts/evals/integration-sandbox-goal-latest.json");
await mkdir(resolve(root, "artifacts/evals"), { recursive: true });

async function run(id, args) {
  const startedAt = Date.now();
  const executable = process.platform === "win32"
    ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
    : "pnpm";
  const executableArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm", ...args]
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
  const exitCode = await new Promise((resolveCode) => child.on("close", resolveCode));
  const lines = `${stdout}\n${stderr}`.split(/\r?\n/).filter(Boolean);
  return {
    id,
    command: `pnpm ${args.join(" ")}`,
    exitCode,
    passed: exitCode === 0,
    durationMs: Date.now() - startedAt,
    summary: lines.slice(-4).join(" | "),
    outputSha256: createHash("sha256").update(`${stdout}\n${stderr}`).digest("hex"),
  };
}

const commands = [];
for (const [id, args] of [
  ["TYPECHECK", ["run", "typecheck"]],
  ["SANDBOX_UNIT_CONTRACT", ["exec", "vitest", "run", "tests/integration-sandbox-contracts.test.ts", "tests/integration-sandbox-store.test.ts", "tests/integration-sandbox-build-boundary.test.ts"]],
  ["SANDBOX_E2E", ["run", "test:e2e", "--", "e2e/integration-sandbox-status.spec.ts"]],
  ["SANDBOX_TECHNICAL_AUDIT", ["run", "audit:integration-sandbox"]],
  ["PRODUCTION_BUILD", ["run", "build"]],
]) {
  commands.push(await run(id, args));
  if (!commands.at(-1).passed) break;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const technical = await readJson("artifacts/evals/integration-sandbox-readiness-latest.json");
const goalDocument = await readFile(resolve(root, "docs/integration-ready-sandbox-goal.md"), "utf8");
const migration = await readFile(resolve(root, ".openai/drizzle/0006_integration_sandbox.sql"), "utf8");
const worker = await readFile(resolve(root, "server/integration-sandbox-store.mjs"), "utf8");
const builtWorkerPath = resolve(root, "dist/server/integration-sandbox-store.mjs");
const builtWorkerExists = await stat(builtWorkerPath).then(() => true).catch(() => false);

const checks = {
  commands: commands.length === 5 && commands.every((item) => item.passed),
  approvedGoal: goalDocument.includes("- 상태: Approved") && goalDocument.includes("INTEGRATION_READY_SANDBOX"),
  technicalAudit: technical.status === "PASSED" && technical.summary.failed === 0,
  safeDefault: technical.checks.some((item) => item.id === "SAFE_DEFAULT_HEALTH" && item.passed),
  tenantAndRoleBoundary: ["AUTHENTICATION_REQUIRED", "ROLE_BOUNDARY"].every((id) => technical.checks.some((item) => item.id === id && item.passed)),
  deterministicOutboxes: ["PLAN_OUTBOX_APPLY", "CUSTOMER_OUTBOX_NO_DELIVERY", "PLAN_COMMAND_IDEMPOTENCY", "STALE_PLAN_BLOCKED"].every((id) => technical.checks.some((item) => item.id === id && item.passed)),
  recovery: ["REDACTED_BACKUP", "RESTORE_HASH_VERIFIED", "RESTORE_WITH_KILL_SWITCHES"].every((id) => technical.checks.some((item) => item.id === id && item.passed)),
  aiFallbackBoundary: technical.checks.some((item) => item.id === "AI_TEMPLATE_FALLBACK_BOUNDARY" && item.passed),
  d1Migration: migration.includes("integration_sandbox_state") && migration.includes("revision INTEGER NOT NULL") && migration.includes("PRAGMA optimize"),
  packagedWorker: builtWorkerExists,
  noExternalConnections: technical.summary.externalTmsConnected === false && technical.summary.actualAuthenticationConnected === false && technical.summary.customerNetworkDeliveryPerformed === false && technical.summary.actualPersonalDataCount === 0,
  tokenNotExposed: !worker.includes("VITE_INTEGRATION_SANDBOX_SERVICE_TOKEN") && !goalDocument.includes("integration-sandbox-audit-token-32-characters"),
};

const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([id]) => id);
const status = failedChecks.length === 0
  ? "READY_FOR_EXTERNAL_ADAPTER_INTEGRATION"
  : "NOT_READY";
const manifestPaths = [
  "docs/integration-ready-sandbox-goal.md",
  "docs/integration-sandbox-runbook.md",
  "docs/decisions.md",
  "docs/product-spec.md",
  "docs/data-contracts.md",
  "docs/privacy-and-ai-policy.md",
  "docs/architecture.md",
  "docs/evals.md",
  "src/domain/operations/integrationSandbox.ts",
  "src/application/operations/createIntegrationSandboxScenario.ts",
  "server/integration-sandbox-store.mjs",
  ".openai/drizzle/0006_integration_sandbox.sql",
  "artifacts/evals/integration-sandbox-readiness-latest.json",
];
const manifest = [];
for (const path of manifestPaths) {
  const bytes = await readFile(resolve(root, path));
  manifest.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}

const result = {
  schemaVersion: "integration-sandbox-goal-audit-v1",
  capturedAt: new Date().toISOString(),
  goal: "INTEGRATION_READY_SANDBOX",
  status,
  dataMode: "PRODUCTION_SANDBOX",
  commands,
  checks,
  failedChecks,
  summary: {
    technicalChecks: technical.checks.length,
    technicalChecksPassed: technical.summary.passed,
    externalTmsConnected: false,
    actualAuthenticationConnected: false,
    actualCourierConnected: false,
    customerNetworkDeliveryPerformed: false,
    actualPersonalDataCount: 0,
    livePilotApproved: false,
  },
  manifest,
  explicitLimitations: [
    "This is an integration-ready production Sandbox, not a live carrier service.",
    "No actual carrier, TMS/WMS, identity provider, courier account, GPS, address, customer contact, or notification provider is connected.",
    "Synthetic technical evidence is not field usability, operational effect, or accident-reduction evidence.",
  ],
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`INTEGRATION_SANDBOX_GOAL_${status} failedChecks=${failedChecks.length} artifact=${outputPath}`);
if (status !== "READY_FOR_EXTERNAL_ADAPTER_INTEGRATION") process.exitCode = 1;
