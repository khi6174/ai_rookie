const EVENTS_PATH = "/api/operations/shadow-live/events";
const STATUS_PATH = "/api/operations/shadow-live/status";
const MAX_BATCH_BYTES = 256 * 1024;
const CONNECTION_ID = /^shadow-[a-z0-9][a-z0-9_-]{3,39}$/;
const EVENT_ID = /^[a-z0-9][a-z0-9_-]{7,63}$/;
const COURIER_REF = /^anon-[a-z0-9][a-z0-9_-]{3,39}$/;
const PLAN_REF = /^plan-[a-z0-9][a-z0-9_-]{3,39}$/;
const EVENT_TYPES = new Set([
  "SHIFT_STARTED",
  "STOP_PROGRESS",
  "PLAN_DELAYED",
  "SHIFT_ENDED",
]);
const BATCH_KEYS = new Set(["schemaVersion", "dataMode", "source", "events"]);
const SOURCE_KEYS = new Set(["kind", "connectionId", "generatedAt"]);
const EVENT_KEYS = new Set([
  "eventId",
  "sequence",
  "occurredAt",
  "eventType",
  "courierRef",
  "planRef",
  "completedStopCount",
  "totalStopCount",
  "coarseZone",
]);
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function configuration(options) {
  const retentionHours = Number(options.retentionHours);
  if (
    options.enabled !== true ||
    typeof options.ingestToken !== "string" ||
    options.ingestToken.length < 32 ||
    typeof options.connectionId !== "string" ||
    !CONNECTION_ID.test(options.connectionId) ||
    !Number.isInteger(retentionHours) ||
    retentionHours < 1 ||
    retentionHours > 24
  ) {
    return undefined;
  }
  return {
    connectionId: options.connectionId,
    ingestToken: options.ingestToken,
    retentionHours,
  };
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function isAuthorized(request, token) {
  const authorization = request.headers.get("authorization") ?? "";
  return constantTimeEqual(authorization, `Bearer ${token}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function collectForbiddenFields(value, path = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenFields(item, [...path, index]),
    );
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

function isIsoDateTime(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function validateBatch(value, configuredConnectionId) {
  const forbidden = collectForbiddenFields(value);
  if (forbidden.length > 0) {
    return forbidden.map((fieldPath) => ({
      fieldPath,
      message: "개인정보·정밀 위치·생체정보 필드는 허용되지 않습니다.",
    }));
  }
  if (!isRecord(value)) {
    return [{ fieldPath: "batch", message: "이벤트 묶음은 객체여야 합니다." }];
  }
  const issues = unknownKeys(value, BATCH_KEYS).map((key) => ({
    fieldPath: key,
    message: "허용되지 않은 필드입니다.",
  }));
  if (value.schemaVersion !== "shadow-live-progress-batch-v1") {
    issues.push({ fieldPath: "schemaVersion", message: "지원하지 않는 계약입니다." });
  }
  if (value.dataMode !== "LIVE_PILOT") {
    issues.push({ fieldPath: "dataMode", message: "LIVE_PILOT만 허용됩니다." });
  }
  if (!isRecord(value.source)) {
    issues.push({ fieldPath: "source", message: "source가 필요합니다." });
  } else {
    for (const key of unknownKeys(value.source, SOURCE_KEYS)) {
      issues.push({ fieldPath: `source.${key}`, message: "허용되지 않은 필드입니다." });
    }
    if (value.source.kind !== "READ_ONLY_CONNECTOR") {
      issues.push({ fieldPath: "source.kind", message: "읽기 전용 연결만 허용됩니다." });
    }
    if (value.source.connectionId !== configuredConnectionId) {
      issues.push({ fieldPath: "source.connectionId", message: "승인된 연결 ID와 다릅니다." });
    }
    if (!isIsoDateTime(value.source.generatedAt)) {
      issues.push({ fieldPath: "source.generatedAt", message: "offset이 포함된 시각이 필요합니다." });
    }
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 500) {
    issues.push({ fieldPath: "events", message: "이벤트는 1~500건이어야 합니다." });
    return issues;
  }
  const eventIds = new Set();
  let previousSequence = -1;
  for (const [index, event] of value.events.entries()) {
    const path = `events.${index}`;
    if (!isRecord(event)) {
      issues.push({ fieldPath: path, message: "이벤트는 객체여야 합니다." });
      continue;
    }
    for (const key of unknownKeys(event, EVENT_KEYS)) {
      issues.push({ fieldPath: `${path}.${key}`, message: "허용되지 않은 필드입니다." });
    }
    if (typeof event.eventId !== "string" || !EVENT_ID.test(event.eventId)) {
      issues.push({ fieldPath: `${path}.eventId`, message: "가명 eventId 형식이 올바르지 않습니다." });
    } else if (eventIds.has(event.eventId)) {
      issues.push({ fieldPath: `${path}.eventId`, message: "eventId가 중복되었습니다." });
    } else {
      eventIds.add(event.eventId);
    }
    if (!Number.isInteger(event.sequence) || event.sequence < 0) {
      issues.push({ fieldPath: `${path}.sequence`, message: "sequence는 0 이상의 정수여야 합니다." });
    } else if (event.sequence <= previousSequence) {
      issues.push({ fieldPath: `${path}.sequence`, message: "sequence는 이전 이벤트보다 커야 합니다." });
    } else {
      previousSequence = event.sequence;
    }
    if (!isIsoDateTime(event.occurredAt)) {
      issues.push({ fieldPath: `${path}.occurredAt`, message: "offset이 포함된 시각이 필요합니다." });
    }
    if (!EVENT_TYPES.has(event.eventType)) {
      issues.push({ fieldPath: `${path}.eventType`, message: "지원하지 않는 이벤트 종류입니다." });
    }
    if (typeof event.courierRef !== "string" || !COURIER_REF.test(event.courierRef)) {
      issues.push({ fieldPath: `${path}.courierRef`, message: "가명 기사 참조 형식이 올바르지 않습니다." });
    }
    if (typeof event.planRef !== "string" || !PLAN_REF.test(event.planRef)) {
      issues.push({ fieldPath: `${path}.planRef`, message: "가명 계획 참조 형식이 올바르지 않습니다." });
    }
    if (!Number.isInteger(event.completedStopCount) || event.completedStopCount < 0) {
      issues.push({ fieldPath: `${path}.completedStopCount`, message: "완료 배송 수가 올바르지 않습니다." });
    }
    if (!Number.isInteger(event.totalStopCount) || event.totalStopCount < 1 || event.totalStopCount > 500) {
      issues.push({ fieldPath: `${path}.totalStopCount`, message: "전체 배송 수는 1~500이어야 합니다." });
    } else if (event.completedStopCount > event.totalStopCount) {
      issues.push({ fieldPath: `${path}.completedStopCount`, message: "완료 배송 수는 전체 배송 수를 넘을 수 없습니다." });
    }
    if (event.coarseZone !== undefined && (
      typeof event.coarseZone !== "string" ||
      event.coarseZone.length < 2 ||
      event.coarseZone.length > 32
    )) {
      issues.push({ fieldPath: `${path}.coarseZone`, message: "거친 권역은 2~32자여야 합니다." });
    }
  }
  return issues;
}

function derivedEvent(connectionId, event, receivedAt, expiresAt) {
  return {
    eventId: event.eventId,
    connectionId,
    sequence: event.sequence,
    occurredAt: event.occurredAt,
    eventType: event.eventType,
    courierRef: event.courierRef,
    planRef: event.planRef,
    completedStopCount: event.completedStopCount,
    totalStopCount: event.totalStopCount,
    coarseZone: event.coarseZone ?? null,
    receivedAt,
    expiresAt,
  };
}

function canonicalEvent(event) {
  return JSON.stringify([
    event.eventId,
    event.connectionId,
    event.sequence,
    event.occurredAt,
    event.eventType,
    event.courierRef,
    event.planRef,
    event.completedStopCount,
    event.totalStopCount,
    event.coarseZone,
  ]);
}

async function fingerprint(event) {
  const bytes = new TextEncoder().encode(canonicalEvent(event));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureSchema(database) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS shadow_live_progress_events (
      event_id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      courier_ref TEXT NOT NULL,
      plan_ref TEXT NOT NULL,
      completed_stop_count INTEGER NOT NULL,
      total_stop_count INTEGER NOT NULL,
      coarse_zone TEXT,
      event_fingerprint TEXT NOT NULL,
      received_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      UNIQUE (connection_id, sequence)
    )`),
    database.prepare(`CREATE INDEX IF NOT EXISTS idx_shadow_live_connection_sequence
      ON shadow_live_progress_events(connection_id, sequence DESC)`),
    database.prepare(`CREATE INDEX IF NOT EXISTS idx_shadow_live_expires
      ON shadow_live_progress_events(expires_at)`),
  ]);
}

export function createMemoryShadowLiveStore() {
  return { events: new Map() };
}

function configuredError() {
  return json({
    code: "SHADOW_LIVE_NOT_CONFIGURED",
    error: "Shadow Live 수신은 승인된 연결·인증·보존 설정이 없어 비활성 상태입니다.",
  }, 503);
}

async function statusResponse(options, config, nowIso) {
  if (options.database) {
    await ensureSchema(options.database);
    await options.database.prepare(
      "DELETE FROM shadow_live_progress_events WHERE expires_at <= ?1",
    ).bind(nowIso).run();
    const row = await options.database.prepare(
      `SELECT COUNT(*) AS event_count,
              COUNT(DISTINCT courier_ref) AS courier_count,
              MAX(sequence) AS latest_sequence,
              MAX(occurred_at) AS latest_occurred_at,
              MAX(received_at) AS latest_received_at
       FROM shadow_live_progress_events
       WHERE connection_id = ?1`,
    ).bind(config.connectionId).first();
    return json({
      schemaVersion: "shadow-live-status-v1",
      connectionId: config.connectionId,
      eventCount: Number(row?.event_count ?? 0),
      courierCount: Number(row?.courier_count ?? 0),
      latestSequence: row?.latest_sequence ?? null,
      latestOccurredAt: row?.latest_occurred_at ?? null,
      latestReceivedAt: row?.latest_received_at ?? null,
      storage: "D1_DERIVED_ONLY",
      retentionHours: config.retentionHours,
      rawStored: false,
      readOnly: true,
      safetyEngineUsed: false,
    });
  }
  const events = [...options.memoryStore.events.values()].filter((event) => {
    if (event.expiresAt <= nowIso) {
      options.memoryStore.events.delete(event.eventId);
      return false;
    }
    return event.connectionId === config.connectionId;
  });
  const latest = [...events].sort((left, right) => right.sequence - left.sequence)[0];
  return json({
    schemaVersion: "shadow-live-status-v1",
    connectionId: config.connectionId,
    eventCount: events.length,
    courierCount: new Set(events.map((event) => event.courierRef)).size,
    latestSequence: latest?.sequence ?? null,
    latestOccurredAt: latest?.occurredAt ?? null,
    latestReceivedAt: latest?.receivedAt ?? null,
    storage: "MEMORY_DEV_DERIVED_ONLY",
    retentionHours: config.retentionHours,
    rawStored: false,
    readOnly: true,
    safetyEngineUsed: false,
  });
}

async function ingestMemory(options, config, events) {
  const active = [...options.memoryStore.events.values()].filter(
    (event) => event.connectionId === config.connectionId,
  );
  const fingerprints = new Map();
  for (const event of events) fingerprints.set(event.eventId, await fingerprint(event));
  const newEvents = [];
  let duplicateCount = 0;
  const latestSequence = active.reduce(
    (latest, event) => Math.max(latest, event.sequence),
    -1,
  );
  for (const event of events) {
    const existing = options.memoryStore.events.get(event.eventId);
    if (existing) {
      if (existing.eventFingerprint !== fingerprints.get(event.eventId)) {
        return json({ code: "SHADOW_LIVE_EVENT_CONFLICT", error: "같은 eventId의 내용이 다릅니다." }, 409);
      }
      duplicateCount += 1;
      continue;
    }
    if (event.sequence <= latestSequence) {
      return json({ code: "SHADOW_LIVE_SEQUENCE_CONFLICT", error: "저장된 sequence보다 오래된 이벤트입니다." }, 409);
    }
    newEvents.push({ ...event, eventFingerprint: fingerprints.get(event.eventId) });
  }
  for (const event of newEvents) options.memoryStore.events.set(event.eventId, event);
  return {
    acceptedCount: newEvents.length,
    duplicateCount,
    latestSequence: Math.max(latestSequence, ...newEvents.map((event) => event.sequence)),
  };
}

async function ingestDatabase(options, config, events, nowIso) {
  await ensureSchema(options.database);
  await options.database.prepare(
    "DELETE FROM shadow_live_progress_events WHERE expires_at <= ?1",
  ).bind(nowIso).run();
  const latest = await options.database.prepare(
    `SELECT MAX(sequence) AS latest_sequence
     FROM shadow_live_progress_events
     WHERE connection_id = ?1`,
  ).bind(config.connectionId).first();
  const latestSequence = Number(latest?.latest_sequence ?? -1);
  const newEvents = [];
  let duplicateCount = 0;
  for (const event of events) {
    const eventFingerprint = await fingerprint(event);
    const existing = await options.database.prepare(
      "SELECT event_fingerprint FROM shadow_live_progress_events WHERE event_id = ?1",
    ).bind(event.eventId).first();
    if (existing) {
      if (existing.event_fingerprint !== eventFingerprint) {
        return json({ code: "SHADOW_LIVE_EVENT_CONFLICT", error: "같은 eventId의 내용이 다릅니다." }, 409);
      }
      duplicateCount += 1;
      continue;
    }
    if (event.sequence <= latestSequence) {
      return json({ code: "SHADOW_LIVE_SEQUENCE_CONFLICT", error: "저장된 sequence보다 오래된 이벤트입니다." }, 409);
    }
    newEvents.push({ ...event, eventFingerprint });
  }
  if (newEvents.length > 0) {
    await options.database.batch(newEvents.map((event) => options.database.prepare(
      `INSERT INTO shadow_live_progress_events (
        event_id, connection_id, sequence, occurred_at, event_type,
        courier_ref, plan_ref, completed_stop_count, total_stop_count,
        coarse_zone, event_fingerprint, received_at, expires_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    ).bind(
      event.eventId,
      event.connectionId,
      event.sequence,
      event.occurredAt,
      event.eventType,
      event.courierRef,
      event.planRef,
      event.completedStopCount,
      event.totalStopCount,
      event.coarseZone,
      event.eventFingerprint,
      event.receivedAt,
      event.expiresAt,
    )));
  }
  return {
    acceptedCount: newEvents.length,
    duplicateCount,
    latestSequence: Math.max(latestSequence, ...newEvents.map((event) => event.sequence)),
  };
}

export async function handleShadowLiveRequest(request, options = {}) {
  const path = new URL(request.url).pathname;
  if (path !== EVENTS_PATH && path !== STATUS_PATH) return undefined;
  const config = configuration(options);
  if (!config || (!options.database && !options.memoryStore)) return configuredError();
  if (!isAuthorized(request, config.ingestToken)) {
    return json({ code: "SHADOW_LIVE_UNAUTHORIZED", error: "수신 인증에 실패했습니다." }, 401);
  }
  const now = options.now?.() ?? new Date();
  const nowIso = now.toISOString();
  if (path === STATUS_PATH) {
    if (request.method !== "GET") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    return statusResponse(options, config, nowIso);
  }
  if (request.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ code: "SHADOW_LIVE_INVALID_JSON", error: "요청 JSON을 읽지 못했습니다." }, 400);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BATCH_BYTES) {
    return json({ code: "SHADOW_LIVE_TOO_LARGE", error: "요청 크기가 256KiB 제한을 초과했습니다." }, 413);
  }
  let batch;
  try {
    batch = JSON.parse(raw);
  } catch {
    return json({ code: "SHADOW_LIVE_INVALID_JSON", error: "유효한 JSON이 아닙니다." }, 400);
  }
  const issues = validateBatch(batch, config.connectionId);
  if (issues.length > 0) {
    return json({ code: "SHADOW_LIVE_CONTRACT_REJECTED", issues: issues.slice(0, 20) }, 400);
  }
  const expiresAt = new Date(now.getTime() + config.retentionHours * 60 * 60_000).toISOString();
  const events = batch.events.map((event) =>
    derivedEvent(config.connectionId, event, nowIso, expiresAt),
  );
  if (options.memoryStore) {
    for (const [eventId, event] of options.memoryStore.events) {
      if (event.expiresAt <= nowIso) options.memoryStore.events.delete(eventId);
    }
  }
  const result = options.database
    ? await ingestDatabase(options, config, events, nowIso)
    : await ingestMemory(options, config, events);
  if (result instanceof Response) return result;
  return json({
    schemaVersion: "shadow-live-ingest-result-v1",
    connectionId: config.connectionId,
    acceptedCount: result.acceptedCount,
    duplicateCount: result.duplicateCount,
    latestSequence: result.latestSequence,
    storage: options.database ? "D1_DERIVED_ONLY" : "MEMORY_DEV_DERIVED_ONLY",
    retentionHours: config.retentionHours,
    rawStored: false,
    readOnly: true,
    safetyEngineUsed: false,
  }, result.acceptedCount > 0 ? 202 : 200);
}
