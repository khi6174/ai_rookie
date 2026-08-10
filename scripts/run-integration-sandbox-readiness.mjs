import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createMemoryIntegrationSandboxStore,
  handleIntegrationSandboxRequest,
} from "../server/integration-sandbox-store.mjs";

const root = resolve(".");
const outputPath = resolve(root, "artifacts/evals/integration-sandbox-readiness-latest.json");
const migrationPath = resolve(root, ".openai/drizzle/0006_integration_sandbox.sql");
const token = "integration-sandbox-audit-token-32-characters";
const store = createMemoryIntegrationSandboxStore();
const options = {
  memoryStore: store,
  enabled: true,
  serviceToken: token,
  tenantId: "sandbox-tenant-alpha",
  siteId: "sandbox-site-seoul",
  retentionHours: 24,
  rateLimitPerMinute: 120,
  now: () => new Date("2026-08-10T03:00:00.000Z"),
};
const baseUrl = "https://integration-sandbox.audit/api/integration-sandbox";
const checks = [];

function headers(role = "PLATFORM_OPERATOR") {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-sandbox-tenant": "sandbox-tenant-alpha",
    "x-sandbox-site": "sandbox-site-seoul",
    "x-sandbox-actor": "sandbox-actor-admin-001",
    "x-sandbox-role": role,
  };
}

async function call(path, { method = "GET", body, role, requestHeaders } = {}, callOptions = options) {
  const response = await handleIntegrationSandboxRequest(new Request(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders ?? headers(role),
    body: body === undefined ? undefined : JSON.stringify(body),
  }), callOptions);
  return { status: response?.status, body: response ? await response.json() : undefined };
}

function check(id, passed, details) {
  checks.push({ id, passed: passed === true, details });
}

const batch = {
  schemaVersion: "integration-sandbox-tms-batch-v1",
  dataMode: "PRODUCTION_SANDBOX",
  source: {
    kind: "DETERMINISTIC_TMS_SIMULATOR",
    tenantId: "sandbox-tenant-alpha",
    siteId: "sandbox-site-seoul",
    generatedAt: "2026-08-10T12:00:00+09:00",
    scenarioId: "sandbox-scenario-audit-0001",
    seed: 17,
  },
  events: [{
    eventId: "sandbox-event-audit-0001",
    sequence: 1,
    occurredAt: "2026-08-10T12:00:00+09:00",
    eventType: "STOP_PROGRESS",
    courierRef: "anon-sandbox-001",
    planRef: "plan-sandbox-001",
    planVersion: 1,
    completedStopCount: 6,
    totalStopCount: 14,
    coarseZone: "합성 북부권역",
  }],
};

const planCommand = {
  schemaVersion: "integration-sandbox-plan-command-v1",
  dataMode: "PRODUCTION_SANDBOX",
  destination: "SIMULATED_TMS_OUTBOX",
  commandId: "sandbox-command-audit-0001",
  idempotencyKey: "sandbox-idempotency-plan-audit-0001",
  tenantId: "sandbox-tenant-alpha",
  siteId: "sandbox-site-seoul",
  workspaceId: "operations-workspace-00000000-0000-4000-8000-000000000617",
  decisionId: "00000000-0000-4000-8000-000000000701",
  courierRef: "anon-sandbox-001",
  planRef: "plan-sandbox-001",
  expectedPlanVersion: 1,
  requestedAt: "2026-08-10T12:00:00+09:00",
  approvedAt: "2026-08-10T12:01:00+09:00",
  approvedBy: "sandbox-actor-admin-001",
  consentProofs: [{
    actorRef: "anon-sandbox-001",
    response: "AGREED",
    recordedAt: "2026-08-10T12:00:30+09:00",
  }],
  safetyProof: {
    evaluationId: "sandbox-evaluation-audit-0001",
    candidateId: "candidate-safe-delay-audit-001",
    candidateFeasibility: "FEASIBLE",
    riskTransferGuard: "PASSED",
    unsafeRecommendedCount: 0,
  },
  change: {
    nextPlanVersion: 2,
    stopOrderRefs: ["sandbox-stop-0001", "sandbox-stop-0002"],
    etaUpdates: [
      { stopRef: "sandbox-stop-0001", eta: "2026-08-10T12:20:00+09:00" },
      { stopRef: "sandbox-stop-0002", eta: "2026-08-10T12:35:00+09:00" },
    ],
  },
};

const notice = {
  schemaVersion: "integration-sandbox-customer-notice-v1",
  dataMode: "PRODUCTION_SANDBOX",
  destination: "SIMULATED_CUSTOMER_OUTBOX",
  noticeId: "sandbox-notice-audit-0001",
  idempotencyKey: "sandbox-idempotency-notice-audit-0001",
  tenantId: "sandbox-tenant-alpha",
  siteId: "sandbox-site-seoul",
  decisionId: "00000000-0000-4000-8000-000000000701",
  planRef: "plan-sandbox-001",
  appliedPlanVersion: 2,
  recipientRef: "sandbox-recipient-0001",
  templateId: "SAFE_DELAY_APPLIED",
  eta: "2026-08-10T12:20:00+09:00",
  requestedAt: "2026-08-10T12:02:00+09:00",
  networkDelivery: false,
};

const disabledHealth = await call("/health", {}, { enabled: false });
check("SAFE_DEFAULT_HEALTH", disabledHealth.status === 200 && disabledHealth.body.status === "DISABLED", disabledHealth.body.status);

const unauthorized = await call("/readiness", { requestHeaders: { authorization: "Bearer wrong" } });
check("AUTHENTICATION_REQUIRED", unauthorized.status === 401, `status=${unauthorized.status}`);

const courierDenied = await call("/readiness", { role: "COURIER" });
check("ROLE_BOUNDARY", courierDenied.status === 403, `status=${courierDenied.status}`);

const readiness = await call("/readiness");
check("AI_TEMPLATE_FALLBACK_BOUNDARY", readiness.status === 200 && readiness.body.aiExplanation.mode === "TEMPLATE_FALLBACK_ONLY" && readiness.body.aiExplanation.deterministicSafetyIndependent === true, `status=${readiness.status} mode=${readiness.body.aiExplanation?.mode}`);

const ingest = await call("/tms/events", { method: "POST", body: batch, role: "DISPATCHER" });
check("TMS_SIMULATOR_INGEST", ingest.status === 202 && ingest.body.acceptedCount === 1 && ingest.body.rawStored === false, `status=${ingest.status} accepted=${ingest.body.acceptedCount}`);

const duplicate = await call("/tms/events", { method: "POST", body: batch, role: "DISPATCHER" });
check("EVENT_IDEMPOTENCY", duplicate.status === 200 && duplicate.body.duplicateCount === 1, `status=${duplicate.status} duplicate=${duplicate.body.duplicateCount}`);

const forbidden = await call("/tms/events", { method: "POST", body: { ...batch, metadata: { phone: "blocked" } }, role: "DISPATCHER" });
check("PERSONAL_DATA_REJECTION", forbidden.status === 400 && forbidden.body.code === "SANDBOX_FORBIDDEN_FIELDS", `status=${forbidden.status}`);

const applied = await call("/plan-outbox", { method: "POST", body: planCommand, role: "DISPATCHER" });
check("PLAN_OUTBOX_APPLY", applied.status === 202 && applied.body.status === "SIMULATED_APPLIED" && applied.body.networkRequestPerformed === false, `status=${applied.status} outcome=${applied.body.status}`);

const planRetry = await call("/plan-outbox", { method: "POST", body: planCommand, role: "DISPATCHER" });
check("PLAN_COMMAND_IDEMPOTENCY", planRetry.status === 200 && planRetry.body.duplicate === true, `status=${planRetry.status}`);

const stale = await call("/plan-outbox", { method: "POST", body: { ...planCommand, commandId: "sandbox-command-audit-0002", idempotencyKey: "sandbox-idempotency-plan-audit-0002" }, role: "DISPATCHER" });
check("STALE_PLAN_BLOCKED", stale.status === 409 && stale.body.code === "SANDBOX_STALE_PLAN", `status=${stale.status}`);

const noticeRecorded = await call("/customer-outbox", { method: "POST", body: notice, role: "DISPATCHER" });
check("CUSTOMER_OUTBOX_NO_DELIVERY", noticeRecorded.status === 202 && noticeRecorded.body.networkRequestPerformed === false, `status=${noticeRecorded.status}`);

const killSwitch = await call("/kill-switches", { method: "PATCH", body: { planApplyDisabled: true, customerNoticeDisabled: true, aiExplanationDisabled: true } });
check("KILL_SWITCH", killSwitch.status === 200 && killSwitch.body.killSwitches.planApplyDisabled === true, `status=${killSwitch.status}`);

const backup = await call("/backup");
check("REDACTED_BACKUP", backup.status === 200 && backup.body.actualPersonalDataCount === 0 && backup.body.rawStored === false, `status=${backup.status}`);

const restore = await call("/restore/verify", { method: "POST", body: backup.body });
check("RESTORE_HASH_VERIFIED", restore.status === 200 && restore.body.verified === true && restore.body.stateMutationPerformed === false, `status=${restore.status}`);

const restoreApplied = await call("/restore", { method: "POST", body: backup.body });
check("RESTORE_WITH_KILL_SWITCHES", restoreApplied.status === 200 && restoreApplied.body.restored === true && restoreApplied.body.killSwitches.aiExplanationDisabled === true, `status=${restoreApplied.status}`);

const migration = await readFile(migrationPath, "utf8");
check("D1_MIGRATION", migration.includes("integration_sandbox_state") && migration.includes("revision INTEGER NOT NULL"), "0006_integration_sandbox.sql");

const failed = checks.filter((item) => !item.passed);
const evidence = {
  schemaVersion: "integration-sandbox-readiness-audit-v1",
  capturedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASSED" : "FAILED",
  goal: "INTEGRATION_READY_SANDBOX",
  dataMode: "PRODUCTION_SANDBOX",
  checks,
  summary: {
    passed: checks.length - failed.length,
    failed: failed.length,
    eventCount: store.events.size,
    planOutboxCount: store.planOutbox.size,
    customerOutboxCount: store.noticeOutbox.size,
    auditCount: store.audits.length,
    externalTmsConnected: false,
    actualAuthenticationConnected: false,
    customerNetworkDeliveryPerformed: false,
    actualPersonalDataCount: 0,
  },
  migration: {
    path: ".openai/drizzle/0006_integration_sandbox.sql",
    sha256: createHash("sha256").update(migration).digest("hex"),
  },
  limitations: [
    "The audit uses deterministic synthetic identities and events only.",
    "No actual carrier, TMS, courier account, GPS, address, customer contact, or notification provider is connected.",
    "Passing this audit is not LIVE_PILOT or field-effect evidence.",
  ],
};

await mkdir(resolve(root, "artifacts/evals"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`INTEGRATION_SANDBOX_AUDIT_${evidence.status} checks=${checks.length} failed=${failed.length} artifact=${outputPath}`);
if (failed.length > 0) process.exitCode = 1;
