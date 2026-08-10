const PREFIX = "/api/integration-sandbox";
const HEALTH_PATH = `${PREFIX}/health`;
const READINESS_PATH = `${PREFIX}/readiness`;
const EVENTS_PATH = `${PREFIX}/tms/events`;
const PLAN_OUTBOX_PATH = `${PREFIX}/plan-outbox`;
const NOTICE_OUTBOX_PATH = `${PREFIX}/customer-outbox`;
const KILL_SWITCHES_PATH = `${PREFIX}/kill-switches`;
const BACKUP_PATH = `${PREFIX}/backup`;
const RESTORE_VERIFY_PATH = `${PREFIX}/restore/verify`;
const RESTORE_PATH = `${PREFIX}/restore`;
const RETENTION_PATH = `${PREFIX}/retention`;
const MAX_BODY_BYTES = 256 * 1024;
const TOKEN_MINIMUM = 32;
const ID = /^[a-z0-9][a-z0-9_-]{3,79}$/;
const TENANT_ID = /^sandbox-tenant-[a-z0-9][a-z0-9_-]{3,39}$/;
const SITE_ID = /^sandbox-site-[a-z0-9][a-z0-9_-]{3,39}$/;
const ACTOR_ID = /^sandbox-actor-[a-z0-9][a-z0-9_-]{3,39}$/;
const COURIER_REF = /^anon-[a-z0-9][a-z0-9_-]{3,39}$/;
const PLAN_REF = /^plan-[a-z0-9][a-z0-9_-]{3,39}$/;
const RECIPIENT_REF = /^sandbox-recipient-[a-z0-9][a-z0-9_-]{3,39}$/;
const ROLES = new Set(["PLATFORM_OPERATOR", "TENANT_ADMIN", "DISPATCHER", "COURIER"]);
const TMS_EVENT_TYPES = new Set(["SHIFT_STARTED", "STOP_PROGRESS", "PLAN_DELAYED", "BREAK_STARTED", "BREAK_ENDED", "SHIFT_ENDED"]);
const NOTICE_TEMPLATES = new Set(["SAFE_DELAY_APPLIED", "ETA_UPDATED", "PLAN_RESTORED"]);
const TMS_BATCH_KEYS = new Set(["schemaVersion", "dataMode", "source", "events"]);
const TMS_SOURCE_KEYS = new Set(["kind", "tenantId", "siteId", "generatedAt", "scenarioId", "seed"]);
const TMS_EVENT_KEYS = new Set(["eventId", "sequence", "occurredAt", "eventType", "courierRef", "planRef", "planVersion", "completedStopCount", "totalStopCount", "coarseZone"]);
const PLAN_COMMAND_KEYS = new Set(["schemaVersion", "dataMode", "destination", "commandId", "idempotencyKey", "tenantId", "siteId", "workspaceId", "decisionId", "courierRef", "planRef", "expectedPlanVersion", "requestedAt", "approvedAt", "approvedBy", "consentProofs", "safetyProof", "change"]);
const CONSENT_KEYS = new Set(["actorRef", "response", "recordedAt"]);
const SAFETY_PROOF_KEYS = new Set(["evaluationId", "candidateId", "candidateFeasibility", "riskTransferGuard", "unsafeRecommendedCount"]);
const PLAN_CHANGE_KEYS = new Set(["nextPlanVersion", "stopOrderRefs", "etaUpdates"]);
const ETA_UPDATE_KEYS = new Set(["stopRef", "eta"]);
const NOTICE_KEYS = new Set(["schemaVersion", "dataMode", "destination", "noticeId", "idempotencyKey", "tenantId", "siteId", "decisionId", "planRef", "appliedPlanVersion", "recipientRef", "templateId", "eta", "requestedAt", "networkDelivery"]);
const FORBIDDEN_FIELDS = new Set([
  "address",
  "biometric",
  "customer",
  "customername",
  "displayname",
  "email",
  "gps",
  "heartrate",
  "latitude",
  "lat",
  "longitude",
  "lng",
  "name",
  "phone",
  "preciselocation",
  "vehiclenumber",
]);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function configuration(options) {
  const retentionHours = Number(options.retentionHours);
  const rateLimitPerMinute = Number(options.rateLimitPerMinute);
  if (
    options.enabled !== true ||
    typeof options.serviceToken !== "string" ||
    options.serviceToken.length < TOKEN_MINIMUM ||
    typeof options.tenantId !== "string" ||
    !TENANT_ID.test(options.tenantId) ||
    typeof options.siteId !== "string" ||
    !SITE_ID.test(options.siteId) ||
    !Number.isInteger(retentionHours) ||
    retentionHours < 1 ||
    retentionHours > 168 ||
    !Number.isInteger(rateLimitPerMinute) ||
    rateLimitPerMinute < 1 ||
    rateLimitPerMinute > 600
  ) {
    return undefined;
  }
  return {
    serviceToken: options.serviceToken,
    tenantId: options.tenantId,
    siteId: options.siteId,
    retentionHours,
    rateLimitPerMinute,
  };
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoDateTime(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function collectForbiddenFields(value, path = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenFields(item, [...path, index]));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const fieldPath = [...path, key];
    const normalized = key.toLowerCase().replaceAll(/[^a-z]/g, "");
    return [
      ...(FORBIDDEN_FIELDS.has(normalized) ? [fieldPath.join(".")] : []),
      ...collectForbiddenFields(child, fieldPath),
    ];
  });
}

function unknownKeyIssues(value, allowed, path = "") {
  if (!isRecord(value)) return [];
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => ({
      fieldPath: path ? `${path}.${key}` : key,
      message: "허용되지 않은 필드입니다.",
    }));
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]),
  );
}

function configuredError() {
  return json({
    code: "INTEGRATION_SANDBOX_NOT_CONFIGURED",
    error: "Integration Sandbox는 승인된 합성 tenant·인증·보존·rate limit 설정이 없어 비활성 상태입니다.",
  }, 503);
}

function principalFromRequest(request, config) {
  const authorization = request.headers.get("authorization") ?? "";
  const tenantId = request.headers.get("x-sandbox-tenant") ?? "";
  const siteId = request.headers.get("x-sandbox-site") ?? "";
  const actorId = request.headers.get("x-sandbox-actor") ?? "";
  const role = request.headers.get("x-sandbox-role") ?? "";
  if (
    !constantTimeEqual(authorization, `Bearer ${config.serviceToken}`) ||
    tenantId !== config.tenantId ||
    siteId !== config.siteId ||
    !ACTOR_ID.test(actorId) ||
    !ROLES.has(role)
  ) {
    return undefined;
  }
  return { tenantId, siteId, actorId, role };
}

function requireRole(principal, allowedRoles) {
  return allowedRoles.includes(principal.role);
}

function rateLimit(store, config, principal, now) {
  const windowStartedAt = Math.floor(now.getTime() / 60_000) * 60_000;
  const key = `${principal.tenantId}:${principal.actorId}:${windowStartedAt}`;
  const current = store.rateWindows.get(key) ?? 0;
  store.rateWindows.set(key, current + 1);
  for (const storedKey of store.rateWindows.keys()) {
    const storedWindow = Number(storedKey.split(":").at(-1));
    if (storedWindow < windowStartedAt - 60_000) store.rateWindows.delete(storedKey);
  }
  return {
    allowed: current < config.rateLimitPerMinute,
    remaining: Math.max(0, config.rateLimitPerMinute - current - 1),
    resetAt: new Date(windowStartedAt + 60_000).toISOString(),
  };
}

async function readJson(request) {
  let raw;
  try {
    raw = await request.text();
  } catch {
    return { response: json({ code: "SANDBOX_INVALID_JSON", error: "요청 본문을 읽지 못했습니다." }, 400) };
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { response: json({ code: "SANDBOX_TOO_LARGE", error: "요청 크기가 256KiB 제한을 초과했습니다." }, 413) };
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { response: json({ code: "SANDBOX_INVALID_JSON", error: "유효한 JSON이 아닙니다." }, 400) };
  }
  const forbiddenFields = collectForbiddenFields(value);
  if (forbiddenFields.length > 0) {
    return {
      response: json({
        code: "SANDBOX_FORBIDDEN_FIELDS",
        issues: forbiddenFields.slice(0, 20).map((fieldPath) => ({
          fieldPath,
          message: "실제 개인정보·정밀 위치·생체정보 필드는 허용되지 않습니다.",
        })),
      }, 400),
    };
  }
  return { value };
}

function audit(store, principal, action, targetType, targetId, outcome, nowIso, details = {}) {
  store.audits.push({
    auditId: `sandbox-audit-${String(store.audits.length + 1).padStart(8, "0")}`,
    tenantId: principal.tenantId,
    siteId: principal.siteId,
    actorId: principal.actorId,
    role: principal.role,
    action,
    targetType,
    targetId,
    outcome,
    occurredAt: nowIso,
    details,
  });
}

export function createMemoryIntegrationSandboxStore() {
  return {
    events: new Map(),
    planOutbox: new Map(),
    noticeOutbox: new Map(),
    planVersions: new Map(),
    audits: [],
    rateWindows: new Map(),
    killSwitches: {
      planApplyDisabled: false,
      customerNoticeDisabled: false,
      aiExplanationDisabled: false,
    },
    databaseRevision: 0,
    databaseRowExists: false,
  };
}

async function ensureDatabaseSchema(database) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS integration_sandbox_state (
      tenant_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE INDEX IF NOT EXISTS idx_integration_sandbox_state_site
      ON integration_sandbox_state(site_id, updated_at DESC)`),
  ]);
}

function databasePayload(store) {
  return {
    schemaVersion: "integration-sandbox-state-v1",
    dataMode: "PRODUCTION_SANDBOX",
    events: [...store.events.values()],
    planOutbox: [...store.planOutbox.values()],
    noticeOutbox: [...store.noticeOutbox.values()],
    planVersions: [...store.planVersions.entries()],
    audits: store.audits,
    killSwitches: store.killSwitches,
    rawStored: false,
    actualPersonalDataCount: 0,
    networkDeliveryPerformed: false,
  };
}

function restoreDatabasePayload(payload, rateWindows) {
  if (
    !isRecord(payload) ||
    payload.schemaVersion !== "integration-sandbox-state-v1" ||
    payload.dataMode !== "PRODUCTION_SANDBOX" ||
    collectForbiddenFields(payload).length > 0 ||
    !Array.isArray(payload.events) ||
    !Array.isArray(payload.planOutbox) ||
    !Array.isArray(payload.noticeOutbox) ||
    !Array.isArray(payload.planVersions) ||
    !Array.isArray(payload.audits) ||
    !isRecord(payload.killSwitches)
  ) {
    throw new Error("Integration Sandbox D1 상태 계약이 손상되었습니다.");
  }
  const store = createMemoryIntegrationSandboxStore();
  store.events = new Map(payload.events.map((item) => [`${item.tenantId}:${item.eventId}`, item]));
  store.planOutbox = new Map(payload.planOutbox.map((item) => [`${item.tenantId}:${item.idempotencyKey}`, item]));
  store.noticeOutbox = new Map(payload.noticeOutbox.map((item) => [`${item.tenantId}:${item.idempotencyKey}`, item]));
  store.planVersions = new Map(payload.planVersions);
  store.audits = payload.audits;
  store.killSwitches = {
    planApplyDisabled: payload.killSwitches.planApplyDisabled === true,
    customerNoticeDisabled: payload.killSwitches.customerNoticeDisabled === true,
    aiExplanationDisabled: payload.killSwitches.aiExplanationDisabled === true,
  };
  store.rateWindows = rateWindows ?? new Map();
  return store;
}

async function loadDatabaseStore(database, config, rateWindows) {
  await ensureDatabaseSchema(database);
  const row = await database.prepare(
    `SELECT site_id, revision, payload_json
     FROM integration_sandbox_state
     WHERE tenant_id = ?1`,
  ).bind(config.tenantId).first();
  if (!row) {
    const store = createMemoryIntegrationSandboxStore();
    store.rateWindows = rateWindows ?? new Map();
    return store;
  }
  if (row.site_id !== config.siteId) {
    throw new Error("Integration Sandbox D1 tenant와 site 설정이 다릅니다.");
  }
  const store = restoreDatabasePayload(JSON.parse(row.payload_json), rateWindows);
  store.databaseRevision = Number(row.revision);
  store.databaseRowExists = true;
  return store;
}

async function persistDatabaseStore(database, config, store, nowIso) {
  const payloadJson = JSON.stringify(databasePayload(store));
  if (new TextEncoder().encode(payloadJson).byteLength > 2_000_000) {
    return false;
  }
  let result;
  if (store.databaseRowExists) {
    result = await database.prepare(
      `UPDATE integration_sandbox_state
       SET site_id = ?2, revision = revision + 1, payload_json = ?3, updated_at = ?4
       WHERE tenant_id = ?1 AND revision = ?5`,
    ).bind(
      config.tenantId,
      config.siteId,
      payloadJson,
      nowIso,
      store.databaseRevision,
    ).run();
  } else {
    result = await database.prepare(
      `INSERT INTO integration_sandbox_state (
        tenant_id, site_id, revision, payload_json, updated_at
      ) VALUES (?1, ?2, 1, ?3, ?4)
      ON CONFLICT(tenant_id) DO NOTHING`,
    ).bind(config.tenantId, config.siteId, payloadJson, nowIso).run();
  }
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changes !== 1) return false;
  store.databaseRevision = store.databaseRowExists ? store.databaseRevision + 1 : 1;
  store.databaseRowExists = true;
  return true;
}

async function persistOrConflict(options, config, store, nowIso) {
  if (!options.database) return undefined;
  try {
    const persisted = await persistDatabaseStore(options.database, config, store, nowIso);
    if (!persisted) {
      return json({
        code: "SANDBOX_STATE_CONFLICT",
        error: "Sandbox 상태가 다른 요청에서 갱신되었습니다. 최신 상태를 다시 불러오세요.",
      }, 409);
    }
    return undefined;
  } catch {
    return json({
      code: "SANDBOX_STORAGE_ERROR",
      error: "Sandbox 상태를 안전하게 저장하지 못했습니다. 기존 상태를 유지합니다.",
    }, 503);
  }
}

function validateTmsBatch(value, principal) {
  const issues = [];
  if (!isRecord(value) || value.schemaVersion !== "integration-sandbox-tms-batch-v1") {
    return [{ fieldPath: "schemaVersion", message: "지원하지 않는 TMS batch 계약입니다." }];
  }
  if (value.dataMode !== "PRODUCTION_SANDBOX") {
    issues.push({ fieldPath: "dataMode", message: "PRODUCTION_SANDBOX만 허용됩니다." });
  }
  issues.push(...unknownKeyIssues(value, TMS_BATCH_KEYS));
  if (!isRecord(value.source)) {
    issues.push({ fieldPath: "source", message: "합성 source가 필요합니다." });
  } else {
    issues.push(...unknownKeyIssues(value.source, TMS_SOURCE_KEYS, "source"));
    if (value.source.kind !== "DETERMINISTIC_TMS_SIMULATOR") {
      issues.push({ fieldPath: "source.kind", message: "결정론적 Simulator만 허용됩니다." });
    }
    if (value.source.tenantId !== principal.tenantId || value.source.siteId !== principal.siteId) {
      issues.push({ fieldPath: "source", message: "인증된 tenant·site와 입력이 다릅니다." });
    }
    if (!isIsoDateTime(value.source.generatedAt)) {
      issues.push({ fieldPath: "source.generatedAt", message: "offset이 포함된 시각이 필요합니다." });
    }
    if (typeof value.source.scenarioId !== "string" || !value.source.scenarioId.startsWith("sandbox-scenario-")) {
      issues.push({ fieldPath: "source.scenarioId", message: "합성 scenario ID가 필요합니다." });
    }
    if (!Number.isInteger(value.source.seed) || value.source.seed < 0) {
      issues.push({ fieldPath: "source.seed", message: "seed는 0 이상의 정수여야 합니다." });
    }
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 500) {
    issues.push({ fieldPath: "events", message: "이벤트는 1~500건이어야 합니다." });
    return issues;
  }
  const ids = new Set();
  let previousSequence = -1;
  for (const [index, event] of value.events.entries()) {
    const path = `events.${index}`;
    if (!isRecord(event)) {
      issues.push({ fieldPath: path, message: "이벤트는 객체여야 합니다." });
      continue;
    }
    issues.push(...unknownKeyIssues(event, TMS_EVENT_KEYS, path));
    if (typeof event.eventId !== "string" || !event.eventId.startsWith("sandbox-event-")) {
      issues.push({ fieldPath: `${path}.eventId`, message: "합성 event ID가 필요합니다." });
    } else if (ids.has(event.eventId)) {
      issues.push({ fieldPath: `${path}.eventId`, message: "eventId가 중복되었습니다." });
    } else {
      ids.add(event.eventId);
    }
    if (!Number.isInteger(event.sequence) || event.sequence < 0 || event.sequence <= previousSequence) {
      issues.push({ fieldPath: `${path}.sequence`, message: "sequence는 단조 증가해야 합니다." });
    } else {
      previousSequence = event.sequence;
    }
    if (!isIsoDateTime(event.occurredAt)) issues.push({ fieldPath: `${path}.occurredAt`, message: "유효한 시각이 필요합니다." });
    if (!TMS_EVENT_TYPES.has(event.eventType)) issues.push({ fieldPath: `${path}.eventType`, message: "지원하지 않는 이벤트 종류입니다." });
    if (!COURIER_REF.test(event.courierRef ?? "")) issues.push({ fieldPath: `${path}.courierRef`, message: "가명 기사 참조가 필요합니다." });
    if (!PLAN_REF.test(event.planRef ?? "")) issues.push({ fieldPath: `${path}.planRef`, message: "가명 계획 참조가 필요합니다." });
    if (!Number.isInteger(event.planVersion) || event.planVersion < 1) issues.push({ fieldPath: `${path}.planVersion`, message: "계획 버전은 양의 정수여야 합니다." });
    if (!Number.isInteger(event.completedStopCount) || !Number.isInteger(event.totalStopCount) || event.completedStopCount < 0 || event.totalStopCount < 1 || event.completedStopCount > event.totalStopCount) {
      issues.push({ fieldPath: `${path}.completedStopCount`, message: "배송 진행 수가 올바르지 않습니다." });
    }
    if (event.coarseZone !== undefined && (typeof event.coarseZone !== "string" || event.coarseZone.length < 2 || event.coarseZone.length > 32)) issues.push({ fieldPath: `${path}.coarseZone`, message: "거친 권역은 2~32자여야 합니다." });
  }
  return issues;
}

async function ingestEvents(store, principal, batch, nowIso, expiresAt) {
  const latestSequence = [...store.events.values()]
    .filter((event) => event.tenantId === principal.tenantId && event.siteId === principal.siteId)
    .reduce((maximum, event) => Math.max(maximum, event.sequence), -1);
  let duplicateCount = 0;
  const pending = [];
  for (const event of batch.events) {
    const fingerprint = await sha256(canonical(event));
    const existing = store.events.get(`${principal.tenantId}:${event.eventId}`);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return json({ code: "SANDBOX_EVENT_CONFLICT", error: "같은 eventId의 내용이 다릅니다." }, 409);
      }
      duplicateCount += 1;
      continue;
    }
    if (event.sequence <= latestSequence) {
      return json({ code: "SANDBOX_SEQUENCE_CONFLICT", error: "저장된 sequence보다 오래된 이벤트입니다." }, 409);
    }
    pending.push({
      tenantId: principal.tenantId,
      siteId: principal.siteId,
      eventId: event.eventId,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      eventType: event.eventType,
      courierRef: event.courierRef,
      planRef: event.planRef,
      planVersion: event.planVersion,
      completedStopCount: event.completedStopCount,
      totalStopCount: event.totalStopCount,
      coarseZone: event.coarseZone ?? null,
      receivedAt: nowIso,
      expiresAt,
      fingerprint,
    });
  }
  for (const event of pending) {
    store.events.set(`${principal.tenantId}:${event.eventId}`, event);
    const planKey = `${principal.tenantId}:${event.planRef}`;
    store.planVersions.set(planKey, Math.max(store.planVersions.get(planKey) ?? 0, event.planVersion));
  }
  return {
    acceptedCount: pending.length,
    duplicateCount,
    latestSequence: Math.max(latestSequence, ...pending.map((event) => event.sequence)),
  };
}

function validatePlanCommand(value, principal) {
  const issues = [];
  if (!isRecord(value) || value.schemaVersion !== "integration-sandbox-plan-command-v1") return [{ fieldPath: "schemaVersion", message: "지원하지 않는 계획 명령 계약입니다." }];
  issues.push(...unknownKeyIssues(value, PLAN_COMMAND_KEYS));
  if (value.dataMode !== "PRODUCTION_SANDBOX" || value.destination !== "SIMULATED_TMS_OUTBOX") issues.push({ fieldPath: "destination", message: "Simulator Outbox만 허용됩니다." });
  if (value.tenantId !== principal.tenantId || value.siteId !== principal.siteId) issues.push({ fieldPath: "tenantId", message: "인증된 tenant·site와 명령이 다릅니다." });
  if (typeof value.commandId !== "string" || !value.commandId.startsWith("sandbox-command-")) issues.push({ fieldPath: "commandId", message: "합성 command ID가 필요합니다." });
  if (typeof value.idempotencyKey !== "string" || !value.idempotencyKey.startsWith("sandbox-idempotency-")) issues.push({ fieldPath: "idempotencyKey", message: "멱등키가 필요합니다." });
  if (typeof value.workspaceId !== "string" || !/^operations-workspace-[a-f0-9-]{36}$/.test(value.workspaceId)) issues.push({ fieldPath: "workspaceId", message: "합성 운영 workspace가 필요합니다." });
  if (typeof value.decisionId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.decisionId)) issues.push({ fieldPath: "decisionId", message: "유효한 decision ID가 필요합니다." });
  if (!COURIER_REF.test(value.courierRef ?? "")) issues.push({ fieldPath: "courierRef", message: "가명 기사 참조가 필요합니다." });
  if (!PLAN_REF.test(value.planRef ?? "")) issues.push({ fieldPath: "planRef", message: "가명 계획 참조가 필요합니다." });
  if (!Number.isInteger(value.expectedPlanVersion) || value.expectedPlanVersion < 1) issues.push({ fieldPath: "expectedPlanVersion", message: "예상 계획 버전이 필요합니다." });
  if (!isIsoDateTime(value.requestedAt)) issues.push({ fieldPath: "requestedAt", message: "유효한 요청 시각이 필요합니다." });
  if (!isRecord(value.change) || value.change.nextPlanVersion !== value.expectedPlanVersion + 1) {
    issues.push({ fieldPath: "change.nextPlanVersion", message: "다음 계획 버전이 올바르지 않습니다." });
  } else {
    issues.push(...unknownKeyIssues(value.change, PLAN_CHANGE_KEYS, "change"));
    if (!Array.isArray(value.change.stopOrderRefs) || value.change.stopOrderRefs.length < 1 || value.change.stopOrderRefs.length > 500 || value.change.stopOrderRefs.some((item) => typeof item !== "string" || !item.startsWith("sandbox-stop-")) || new Set(value.change.stopOrderRefs).size !== value.change.stopOrderRefs.length) issues.push({ fieldPath: "change.stopOrderRefs", message: "중복 없는 합성 배송지 순서가 필요합니다." });
    if (!Array.isArray(value.change.etaUpdates) || value.change.etaUpdates.length < 1 || value.change.etaUpdates.length > 500) {
      issues.push({ fieldPath: "change.etaUpdates", message: "ETA 갱신이 필요합니다." });
    } else {
      for (const [index, update] of value.change.etaUpdates.entries()) {
        issues.push(...unknownKeyIssues(update, ETA_UPDATE_KEYS, `change.etaUpdates.${index}`));
        if (!isRecord(update) || !Array.isArray(value.change.stopOrderRefs) || !value.change.stopOrderRefs.includes(update.stopRef) || !isIsoDateTime(update.eta)) issues.push({ fieldPath: `change.etaUpdates.${index}`, message: "배송지 순서에 포함된 유효한 ETA 갱신이 필요합니다." });
      }
    }
  }
  if (!Array.isArray(value.consentProofs) || value.consentProofs.length < 1 || value.consentProofs.length > 8) {
    issues.push({ fieldPath: "consentProofs", message: "필수 기사 동의 증거가 필요합니다." });
  } else {
    for (const [index, proof] of value.consentProofs.entries()) {
      issues.push(...unknownKeyIssues(proof, CONSENT_KEYS, `consentProofs.${index}`));
      if (!isRecord(proof) || proof.response !== "AGREED" || (!COURIER_REF.test(proof.actorRef ?? "") && !ACTOR_ID.test(proof.actorRef ?? "")) || !isIsoDateTime(proof.recordedAt)) issues.push({ fieldPath: `consentProofs.${index}`, message: "유효한 동의 증거가 필요합니다." });
    }
  }
  if (!isRecord(value.safetyProof) || value.safetyProof.candidateFeasibility !== "FEASIBLE" || value.safetyProof.riskTransferGuard !== "PASSED" || value.safetyProof.unsafeRecommendedCount !== 0) {
    issues.push({ fieldPath: "safetyProof", message: "통과한 안전·위험전가 증거가 필요합니다." });
  } else {
    issues.push(...unknownKeyIssues(value.safetyProof, SAFETY_PROOF_KEYS, "safetyProof"));
    if (typeof value.safetyProof.evaluationId !== "string" || !value.safetyProof.evaluationId.startsWith("sandbox-evaluation-") || typeof value.safetyProof.candidateId !== "string" || value.safetyProof.candidateId.length < 8) issues.push({ fieldPath: "safetyProof", message: "평가와 후보 참조가 필요합니다." });
  }
  if (!isIsoDateTime(value.approvedAt) || value.approvedBy !== principal.actorId) issues.push({ fieldPath: "approvedAt", message: "현재 합성 관리자의 승인 증거가 필요합니다." });
  return issues;
}

async function enqueuePlan(store, principal, command, nowIso, expiresAt, faultMode) {
  const key = `${principal.tenantId}:${command.idempotencyKey}`;
  const fingerprint = await sha256(canonical(command));
  const existing = store.planOutbox.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) return json({ code: "SANDBOX_IDEMPOTENCY_CONFLICT", error: "같은 멱등키의 명령 내용이 다릅니다." }, 409);
    return json({ ...existing, duplicate: true }, 200);
  }
  if (store.killSwitches.planApplyDisabled) return json({ code: "SANDBOX_PLAN_KILL_SWITCH", error: "계획 적용 Simulator가 운영자에 의해 중지되었습니다." }, 423);
  const planKey = `${principal.tenantId}:${command.planRef}`;
  const currentVersion = store.planVersions.get(planKey) ?? command.expectedPlanVersion;
  if (currentVersion !== command.expectedPlanVersion) return json({ code: "SANDBOX_STALE_PLAN", currentPlanVersion: currentVersion, error: "최신 계획 버전과 명령이 다릅니다." }, 409);
  const status = faultMode === "FAIL_PLAN" ? "SIMULATED_FAILED" : "SIMULATED_APPLIED";
  const record = {
    schemaVersion: "integration-sandbox-plan-outbox-record-v1",
    dataMode: "PRODUCTION_SANDBOX",
    tenantId: principal.tenantId,
    siteId: principal.siteId,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    decisionId: command.decisionId,
    planRef: command.planRef,
    expectedPlanVersion: command.expectedPlanVersion,
    nextPlanVersion: command.change.nextPlanVersion,
    status,
    networkRequestPerformed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt,
    fingerprint,
  };
  store.planOutbox.set(key, record);
  if (status === "SIMULATED_APPLIED") store.planVersions.set(planKey, command.change.nextPlanVersion);
  audit(store, principal, "PLAN_OUTBOX_ENQUEUED", "PLAN_COMMAND", command.commandId, status, nowIso, { planRef: command.planRef, expectedPlanVersion: command.expectedPlanVersion, nextPlanVersion: command.change.nextPlanVersion });
  return json(record, status === "SIMULATED_APPLIED" ? 202 : 503);
}

function validateNotice(value, principal) {
  const issues = [];
  if (!isRecord(value) || value.schemaVersion !== "integration-sandbox-customer-notice-v1") return [{ fieldPath: "schemaVersion", message: "지원하지 않는 고객안내 계약입니다." }];
  issues.push(...unknownKeyIssues(value, NOTICE_KEYS));
  if (value.dataMode !== "PRODUCTION_SANDBOX" || value.destination !== "SIMULATED_CUSTOMER_OUTBOX" || value.networkDelivery !== false) issues.push({ fieldPath: "destination", message: "네트워크 발송 없는 Simulator Outbox만 허용됩니다." });
  if (value.tenantId !== principal.tenantId || value.siteId !== principal.siteId) issues.push({ fieldPath: "tenantId", message: "인증된 tenant·site와 안내가 다릅니다." });
  if (typeof value.noticeId !== "string" || !value.noticeId.startsWith("sandbox-notice-")) issues.push({ fieldPath: "noticeId", message: "합성 notice ID가 필요합니다." });
  if (typeof value.idempotencyKey !== "string" || !value.idempotencyKey.startsWith("sandbox-idempotency-")) issues.push({ fieldPath: "idempotencyKey", message: "멱등키가 필요합니다." });
  if (!RECIPIENT_REF.test(value.recipientRef ?? "")) issues.push({ fieldPath: "recipientRef", message: "합성 수신자 참조가 필요합니다." });
  if (!PLAN_REF.test(value.planRef ?? "") || !Number.isInteger(value.appliedPlanVersion)) issues.push({ fieldPath: "planRef", message: "적용된 합성 계획이 필요합니다." });
  if (!NOTICE_TEMPLATES.has(value.templateId)) issues.push({ fieldPath: "templateId", message: "승인된 안내 템플릿이 필요합니다." });
  if (!isIsoDateTime(value.eta) || !isIsoDateTime(value.requestedAt)) issues.push({ fieldPath: "eta", message: "유효한 ETA와 요청 시각이 필요합니다." });
  return issues;
}

async function enqueueNotice(store, principal, command, nowIso, expiresAt, faultMode) {
  const key = `${principal.tenantId}:${command.idempotencyKey}`;
  const fingerprint = await sha256(canonical(command));
  const existing = store.noticeOutbox.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) return json({ code: "SANDBOX_IDEMPOTENCY_CONFLICT", error: "같은 멱등키의 안내 내용이 다릅니다." }, 409);
    return json({ ...existing, duplicate: true }, 200);
  }
  if (store.killSwitches.customerNoticeDisabled) return json({ code: "SANDBOX_NOTICE_KILL_SWITCH", error: "고객안내 Simulator가 운영자에 의해 중지되었습니다." }, 423);
  const currentVersion = store.planVersions.get(`${principal.tenantId}:${command.planRef}`);
  if (currentVersion !== command.appliedPlanVersion) return json({ code: "SANDBOX_NOTICE_PLAN_MISMATCH", currentPlanVersion: currentVersion ?? null, error: "적용된 계획 버전과 고객안내가 다릅니다." }, 409);
  const status = faultMode === "FAIL_NOTICE" ? "SIMULATED_FAILED" : "SIMULATED_RECORDED";
  const record = {
    schemaVersion: "integration-sandbox-customer-outbox-record-v1",
    dataMode: "PRODUCTION_SANDBOX",
    tenantId: principal.tenantId,
    siteId: principal.siteId,
    noticeId: command.noticeId,
    idempotencyKey: command.idempotencyKey,
    decisionId: command.decisionId,
    planRef: command.planRef,
    appliedPlanVersion: command.appliedPlanVersion,
    recipientRef: command.recipientRef,
    templateId: command.templateId,
    status,
    networkRequestPerformed: false,
    createdAt: nowIso,
    expiresAt,
    fingerprint,
  };
  store.noticeOutbox.set(key, record);
  audit(store, principal, "CUSTOMER_OUTBOX_ENQUEUED", "CUSTOMER_NOTICE", command.noticeId, status, nowIso, { planRef: command.planRef, appliedPlanVersion: command.appliedPlanVersion });
  return json(record, status === "SIMULATED_RECORDED" ? 202 : 503);
}

function purgeExpired(store, nowIso, principal) {
  const counts = { events: 0, planOutbox: 0, noticeOutbox: 0 };
  for (const [key, event] of store.events) {
    if (event.expiresAt <= nowIso) { store.events.delete(key); counts.events += 1; }
  }
  for (const [key, record] of store.planOutbox) {
    if (record.expiresAt <= nowIso) { store.planOutbox.delete(key); counts.planOutbox += 1; }
  }
  for (const [key, record] of store.noticeOutbox) {
    if (record.expiresAt <= nowIso) { store.noticeOutbox.delete(key); counts.noticeOutbox += 1; }
  }
  if (counts.events + counts.planOutbox + counts.noticeOutbox > 0 && principal) {
    audit(store, principal, "RETENTION_PURGE", "SANDBOX_STORE", principal.tenantId, "COMPLETED", nowIso, counts);
  }
  return counts;
}

async function backupPayload(store, config, nowIso) {
  const core = {
    schemaVersion: "integration-sandbox-backup-v1",
    dataMode: "PRODUCTION_SANDBOX",
    tenantId: config.tenantId,
    siteId: config.siteId,
    capturedAt: nowIso,
    rawStored: false,
    actualPersonalDataCount: 0,
    networkDeliveryPerformed: false,
    events: [...store.events.values()].filter((item) => item.tenantId === config.tenantId).sort((left, right) => left.sequence - right.sequence),
    planOutbox: [...store.planOutbox.values()].filter((item) => item.tenantId === config.tenantId).sort((left, right) => left.commandId.localeCompare(right.commandId)),
    noticeOutbox: [...store.noticeOutbox.values()].filter((item) => item.tenantId === config.tenantId).sort((left, right) => left.noticeId.localeCompare(right.noticeId)),
    planVersions: [...store.planVersions.entries()].filter(([key]) => key.startsWith(`${config.tenantId}:`)).sort(([left], [right]) => left.localeCompare(right)),
    audits: store.audits.filter((item) => item.tenantId === config.tenantId),
    killSwitches: { ...store.killSwitches },
  };
  return { ...core, backupSha256: await sha256(canonical(core)) };
}

async function validateBackup(value, principal) {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "integration-sandbox-backup-v1" ||
    value.dataMode !== "PRODUCTION_SANDBOX" ||
    value.tenantId !== principal.tenantId ||
    value.siteId !== principal.siteId ||
    value.actualPersonalDataCount !== 0 ||
    value.rawStored !== false ||
    value.networkDeliveryPerformed !== false ||
    typeof value.backupSha256 !== "string" ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.planOutbox) ||
    !Array.isArray(value.noticeOutbox) ||
    !Array.isArray(value.planVersions) ||
    !Array.isArray(value.audits) ||
    !isRecord(value.killSwitches)
  ) {
    return { verified: false, calculatedSha256: null };
  }
  const { backupSha256, ...core } = value;
  const calculatedSha256 = await sha256(canonical(core));
  return {
    verified: constantTimeEqual(calculatedSha256, backupSha256),
    calculatedSha256,
  };
}

function restoreBackupIntoStore(store, backup) {
  store.events = new Map(backup.events.map((item) => [`${item.tenantId}:${item.eventId}`, item]));
  store.planOutbox = new Map(backup.planOutbox.map((item) => [`${item.tenantId}:${item.idempotencyKey}`, item]));
  store.noticeOutbox = new Map(backup.noticeOutbox.map((item) => [`${item.tenantId}:${item.idempotencyKey}`, item]));
  store.planVersions = new Map(backup.planVersions);
  store.audits = [...backup.audits];
  store.killSwitches = {
    planApplyDisabled: true,
    customerNoticeDisabled: true,
    aiExplanationDisabled: true,
  };
}

function listStore(store, principal, kind) {
  const source = kind === "PLAN" ? store.planOutbox : store.noticeOutbox;
  return [...source.values()]
    .filter((item) => item.tenantId === principal.tenantId && item.siteId === principal.siteId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function handleIntegrationSandboxRequest(request, options = {}) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(PREFIX)) return undefined;
  const config = configuration(options);
  const storageConfigured = Boolean(options.memoryStore || options.database);
  if (path === HEALTH_PATH && request.method === "GET") {
    return json({
      schemaVersion: "integration-sandbox-health-v1",
      status: config && storageConfigured ? "READY" : "DISABLED",
      dataMode: "PRODUCTION_SANDBOX",
      configured: Boolean(config && storageConfigured),
      externalTmsConnected: false,
      actualAuthenticationConnected: false,
      customerNetworkDeliveryEnabled: false,
      actualPersonalDataAllowed: false,
    });
  }
  if (!config || !storageConfigured) return configuredError();
  let store;
  try {
    store = options.memoryStore ?? await loadDatabaseStore(
      options.database,
      config,
      options.rateStore,
    );
  } catch {
    return json({
      code: "SANDBOX_STORAGE_ERROR",
      error: "Sandbox 저장소를 검증해 불러오지 못했습니다.",
    }, 503);
  }
  const principal = principalFromRequest(request, config);
  if (!principal) return json({ code: "SANDBOX_UNAUTHORIZED", error: "Sandbox 인증에 실패했습니다." }, 401);
  const now = options.now?.() ?? new Date();
  const nowIso = now.toISOString();
  if (path !== RETENTION_PATH) {
    const purged = purgeExpired(store, nowIso);
    if (purged.events + purged.planOutbox + purged.noticeOutbox > 0) {
      const conflict = await persistOrConflict(options, config, store, nowIso);
      if (conflict) return conflict;
    }
  }
  const limited = rateLimit(store, config, principal, now);
  if (!limited.allowed) return json({ code: "SANDBOX_RATE_LIMITED", error: "Sandbox 분당 요청 한도를 초과했습니다.", resetAt: limited.resetAt }, 429, { "Retry-After": "60" });
  const expiresAt = new Date(now.getTime() + config.retentionHours * 60 * 60_000).toISOString();
  if (path === READINESS_PATH) {
    if (request.method !== "GET") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    if (!requireRole(principal, ["PLATFORM_OPERATOR", "TENANT_ADMIN"])) return json({ code: "SANDBOX_FORBIDDEN", error: "상세 준비상태 권한이 없습니다." }, 403);
    return json({
      schemaVersion: "integration-sandbox-readiness-v1",
      status: "READY",
      dataMode: "PRODUCTION_SANDBOX",
      tenantId: principal.tenantId,
      siteId: principal.siteId,
      storage: options.database ? "D1" : "MEMORY_DEV",
      retentionHours: config.retentionHours,
      rateLimitPerMinute: config.rateLimitPerMinute,
      killSwitches: { ...store.killSwitches },
      counts: {
        events: [...store.events.values()].filter((item) => item.tenantId === principal.tenantId).length,
        planOutbox: listStore(store, principal, "PLAN").length,
        noticeOutbox: listStore(store, principal, "NOTICE").length,
        audits: store.audits.filter((item) => item.tenantId === principal.tenantId).length,
      },
      externalConnections: { tms: false, authentication: false, customerDelivery: false },
      aiExplanation: {
        mode: store.killSwitches.aiExplanationDisabled
          ? "DISABLED_BY_KILL_SWITCH"
          : options.aiConfigured
            ? "HOSTED_WITH_TEMPLATE_FALLBACK"
            : "TEMPLATE_FALLBACK_ONLY",
        deterministicSafetyIndependent: true,
      },
      rawStored: false,
      actualPersonalDataCount: 0,
    }, 200, { "X-RateLimit-Remaining": String(limited.remaining) });
  }
  if (path === EVENTS_PATH) {
    if (request.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    if (!requireRole(principal, ["PLATFORM_OPERATOR", "TENANT_ADMIN", "DISPATCHER"])) return json({ code: "SANDBOX_FORBIDDEN", error: "TMS Simulator 수신 권한이 없습니다." }, 403);
    const parsed = await readJson(request);
    if (parsed.response) return parsed.response;
    const issues = validateTmsBatch(parsed.value, principal);
    if (issues.length > 0) return json({ code: "SANDBOX_CONTRACT_REJECTED", issues: issues.slice(0, 20) }, 400);
    const result = await ingestEvents(store, principal, parsed.value, nowIso, expiresAt);
    if (result instanceof Response) return result;
    audit(store, principal, "TMS_EVENTS_INGESTED", "TMS_BATCH", parsed.value.source.scenarioId, "ACCEPTED", nowIso, result);
    if (result.acceptedCount > 0 || result.duplicateCount > 0) {
      const conflict = await persistOrConflict(options, config, store, nowIso);
      if (conflict) return conflict;
    }
    return json({ schemaVersion: "integration-sandbox-tms-ingest-result-v1", dataMode: "PRODUCTION_SANDBOX", ...result, storage: options.database ? "D1_DERIVED_ONLY" : "MEMORY_DEV_DERIVED_ONLY", rawStored: false, safetyEngineUsed: false }, result.acceptedCount > 0 ? 202 : 200);
  }
  if (path === PLAN_OUTBOX_PATH) {
    if (!requireRole(principal, ["PLATFORM_OPERATOR", "TENANT_ADMIN", "DISPATCHER"])) return json({ code: "SANDBOX_FORBIDDEN", error: "계획 Outbox 권한이 없습니다." }, 403);
    if (request.method === "GET") return json({ schemaVersion: "integration-sandbox-plan-outbox-list-v1", dataMode: "PRODUCTION_SANDBOX", records: listStore(store, principal, "PLAN") });
    if (request.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    const parsed = await readJson(request);
    if (parsed.response) return parsed.response;
    const issues = validatePlanCommand(parsed.value, principal);
    if (issues.length > 0) return json({ code: "SANDBOX_PLAN_COMMAND_REJECTED", issues: issues.slice(0, 20) }, 400);
    const beforeSize = store.planOutbox.size;
    const beforeAudit = store.audits.length;
    const response = await enqueuePlan(store, principal, parsed.value, nowIso, expiresAt, options.faultMode ?? "NONE");
    if (store.planOutbox.size !== beforeSize || store.audits.length !== beforeAudit) {
      const conflict = await persistOrConflict(options, config, store, nowIso);
      if (conflict) return conflict;
    }
    return response;
  }
  if (path === NOTICE_OUTBOX_PATH) {
    if (!requireRole(principal, ["PLATFORM_OPERATOR", "TENANT_ADMIN", "DISPATCHER"])) return json({ code: "SANDBOX_FORBIDDEN", error: "고객안내 Outbox 권한이 없습니다." }, 403);
    if (request.method === "GET") return json({ schemaVersion: "integration-sandbox-customer-outbox-list-v1", dataMode: "PRODUCTION_SANDBOX", records: listStore(store, principal, "NOTICE") });
    if (request.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    const parsed = await readJson(request);
    if (parsed.response) return parsed.response;
    const issues = validateNotice(parsed.value, principal);
    if (issues.length > 0) return json({ code: "SANDBOX_CUSTOMER_NOTICE_REJECTED", issues: issues.slice(0, 20) }, 400);
    const beforeSize = store.noticeOutbox.size;
    const beforeAudit = store.audits.length;
    const response = await enqueueNotice(store, principal, parsed.value, nowIso, expiresAt, options.faultMode ?? "NONE");
    if (store.noticeOutbox.size !== beforeSize || store.audits.length !== beforeAudit) {
      const conflict = await persistOrConflict(options, config, store, nowIso);
      if (conflict) return conflict;
    }
    return response;
  }
  if (path === KILL_SWITCHES_PATH) {
    if (!requireRole(principal, ["PLATFORM_OPERATOR"])) return json({ code: "SANDBOX_FORBIDDEN", error: "Kill switch 권한이 없습니다." }, 403);
    if (request.method === "GET") return json({ schemaVersion: "integration-sandbox-kill-switches-v1", dataMode: "PRODUCTION_SANDBOX", killSwitches: { ...store.killSwitches } });
    if (request.method !== "PATCH") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    const parsed = await readJson(request);
    if (parsed.response) return parsed.response;
    if (!isRecord(parsed.value) || typeof parsed.value.planApplyDisabled !== "boolean" || typeof parsed.value.customerNoticeDisabled !== "boolean" || typeof parsed.value.aiExplanationDisabled !== "boolean") return json({ code: "SANDBOX_KILL_SWITCH_REJECTED", error: "계획·고객안내·AI Kill switch의 boolean 값이 필요합니다." }, 400);
    store.killSwitches = { planApplyDisabled: parsed.value.planApplyDisabled, customerNoticeDisabled: parsed.value.customerNoticeDisabled, aiExplanationDisabled: parsed.value.aiExplanationDisabled };
    audit(store, principal, "KILL_SWITCH_UPDATED", "SANDBOX_CONTROL", principal.tenantId, "COMPLETED", nowIso, store.killSwitches);
    {
      const conflict = await persistOrConflict(options, config, store, nowIso);
      if (conflict) return conflict;
    }
    return json({ schemaVersion: "integration-sandbox-kill-switches-v1", dataMode: "PRODUCTION_SANDBOX", killSwitches: { ...store.killSwitches } });
  }
  if (path === BACKUP_PATH) {
    if (request.method !== "GET") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    if (!requireRole(principal, ["PLATFORM_OPERATOR"])) return json({ code: "SANDBOX_FORBIDDEN", error: "백업 내보내기 권한이 없습니다." }, 403);
    const backup = await backupPayload(store, config, nowIso);
    audit(store, principal, "BACKUP_EXPORTED", "SANDBOX_BACKUP", backup.backupSha256, "COMPLETED", nowIso, { actualPersonalDataCount: 0 });
    {
      const conflict = await persistOrConflict(options, config, store, nowIso);
      if (conflict) return conflict;
    }
    return json(backup);
  }
  if (path === RESTORE_VERIFY_PATH) {
    if (request.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    if (!requireRole(principal, ["PLATFORM_OPERATOR"])) return json({ code: "SANDBOX_FORBIDDEN", error: "복원 검증 권한이 없습니다." }, 403);
    const parsed = await readJson(request);
    if (parsed.response) return parsed.response;
    const supplied = parsed.value;
    const validation = await validateBackup(supplied, principal);
    if (validation.calculatedSha256 === null) return json({ code: "SANDBOX_BACKUP_REJECTED", error: "승인된 tenant의 Sandbox 백업 계약이 아닙니다." }, 400);
    const verified = validation.verified;
    audit(store, principal, "RESTORE_VERIFIED", "SANDBOX_BACKUP", supplied.backupSha256, verified ? "VERIFIED" : "REJECTED", nowIso, { stateMutationPerformed: false });
    {
      const conflict = await persistOrConflict(options, config, store, nowIso);
      if (conflict) return conflict;
    }
    return json({ schemaVersion: "integration-sandbox-restore-verification-v1", dataMode: "PRODUCTION_SANDBOX", verified, suppliedSha256: supplied.backupSha256, calculatedSha256: validation.calculatedSha256, stateMutationPerformed: false }, verified ? 200 : 409);
  }
  if (path === RESTORE_PATH) {
    if (request.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    if (!requireRole(principal, ["PLATFORM_OPERATOR"])) return json({ code: "SANDBOX_FORBIDDEN", error: "Sandbox 복구 권한이 없습니다." }, 403);
    if (!store.killSwitches.planApplyDisabled || !store.killSwitches.customerNoticeDisabled || !store.killSwitches.aiExplanationDisabled) {
      return json({ code: "SANDBOX_RESTORE_REQUIRES_KILL_SWITCHES", error: "계획·고객안내·AI Kill switch를 모두 켠 뒤 복구해야 합니다." }, 423);
    }
    const parsed = await readJson(request);
    if (parsed.response) return parsed.response;
    const validation = await validateBackup(parsed.value, principal);
    if (!validation.verified) return json({ code: "SANDBOX_BACKUP_REJECTED", error: "백업 계약 또는 SHA-256 검증에 실패했습니다.", calculatedSha256: validation.calculatedSha256 }, validation.calculatedSha256 === null ? 400 : 409);
    restoreBackupIntoStore(store, parsed.value);
    audit(store, principal, "RESTORE_APPLIED", "SANDBOX_BACKUP", parsed.value.backupSha256, "RESTORED_WITH_KILL_SWITCHES", nowIso, { stateMutationPerformed: true });
    const conflict = await persistOrConflict(options, config, store, nowIso);
    if (conflict) return conflict;
    return json({ schemaVersion: "integration-sandbox-restore-result-v1", dataMode: "PRODUCTION_SANDBOX", restored: true, restoredStateSha256: parsed.value.backupSha256, stateMutationPerformed: true, killSwitches: { ...store.killSwitches }, counts: { events: store.events.size, planOutbox: store.planOutbox.size, noticeOutbox: store.noticeOutbox.size } });
  }
  if (path === RETENTION_PATH) {
    if (request.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    if (!requireRole(principal, ["PLATFORM_OPERATOR"])) return json({ code: "SANDBOX_FORBIDDEN", error: "보존 삭제 권한이 없습니다." }, 403);
    const counts = purgeExpired(store, nowIso, principal);
    if (counts.events + counts.planOutbox + counts.noticeOutbox > 0 || store.audits.length > 0) {
      const conflict = await persistOrConflict(options, config, store, nowIso);
      if (conflict) return conflict;
    }
    return json({ schemaVersion: "integration-sandbox-retention-result-v1", dataMode: "PRODUCTION_SANDBOX", deleted: counts, completedAt: nowIso });
  }
  return json({ error: "Integration Sandbox 경로를 찾을 수 없습니다." }, 404);
}
