const MAX_SESSION_BYTES = 2_000_000;
const WORKSPACE_ID = /^operations-workspace-[a-f0-9-]{36}$/;
const COURIER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const PII_PATTERN =
  /01[016789][-\s]?\d{3,4}[-\s]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
const UUID_PATTERN =
  /\b[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/gi;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function sessionJson(body, updatedAt, status = 200) {
  const response = json(body, status);
  response.headers.set("ETag", `\"${updatedAt}\"`);
  return response;
}

function notModified(updatedAt) {
  return new Response(null, {
    status: 304,
    headers: {
      "Cache-Control": "no-store",
      ETag: `\"${updatedAt}\"`,
    },
  });
}

function noLinkedSession() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

function matchesVersion(request, updatedAt) {
  return request.headers.get("if-none-match") === `\"${updatedAt}\"`;
}

function sessionIdFromUrl(request) {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/api\/operations\/sessions\/([^/]+)$/);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

function courierIdFromUrl(request) {
  const path = new URL(request.url).pathname;
  const match = path.match(
    /^\/api\/operations\/couriers\/([^/]+)\/latest-session$/,
  );
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

async function ensureSchema(database) {
  await database.batch([
    database
      .prepare(
        `CREATE TABLE IF NOT EXISTS operations_sessions (
          workspace_id TEXT PRIMARY KEY,
          snapshot_id TEXT NOT NULL,
          operation_date TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
      ),
    database
      .prepare(
        `CREATE INDEX IF NOT EXISTS operations_sessions_updated_at_idx
         ON operations_sessions(updated_at)`,
      ),
    database
      .prepare(
        `CREATE TABLE IF NOT EXISTS operations_session_participants (
          workspace_id TEXT NOT NULL,
          decision_id TEXT NOT NULL,
          courier_id TEXT NOT NULL,
          participant_role TEXT NOT NULL CHECK (participant_role IN ('SOURCE', 'RECIPIENT')),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (workspace_id, decision_id, courier_id),
          FOREIGN KEY (workspace_id) REFERENCES operations_sessions(workspace_id) ON DELETE CASCADE
        )`,
      ),
    database
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_operations_session_participants_courier
         ON operations_session_participants(courier_id, updated_at DESC)`,
      ),
  ]);
}

function sessionParticipants(value) {
  const decisions = Array.isArray(value?.workspace?.decisions)
    ? value.workspace.decisions
    : [];
  return decisions.flatMap((artifacts) => {
    const decisionId = artifacts?.decision?.decisionId;
    const sourceCourierId = artifacts?.queueItem?.courierId;
    const affectedCourierIds = artifacts?.selectedCandidate?.affectedCourierIds;
    if (
      typeof decisionId !== "string" ||
      typeof sourceCourierId !== "string" ||
      !Array.isArray(affectedCourierIds)
    ) {
      return [];
    }
    return [...new Set([sourceCourierId, ...affectedCourierIds])]
      .filter((courierId) =>
        typeof courierId === "string" && COURIER_ID.test(courierId),
      )
      .map((courierId) => ({
        decisionId,
        courierId,
        participantRole:
          courierId === sourceCourierId ? "SOURCE" : "RECIPIENT",
      }));
  });
}

function latestMemorySessionForCourier(memoryStore, courierId) {
  return [...memoryStore.values()]
    .flatMap((session) =>
      sessionParticipants(session)
        .filter((participant) => participant.courierId === courierId)
        .map((participant) => ({ session, participant })),
    )
    .sort((left, right) =>
      right.session.savedAt.localeCompare(left.session.savedAt),
    )
    .at(0);
}

function validatePayload(workspaceId, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "세션 payload는 객체여야 합니다.";
  }
  if (value.schemaVersion !== "operations-persisted-session-v1") {
    return "지원하지 않는 세션 계약입니다.";
  }
  if (value.workspaceId !== workspaceId) {
    return "경로와 세션 workspace ID가 다릅니다.";
  }
  if (value.operationsPackage?.dataMode !== "SYNTHETIC") {
    return "합성 운영 데이터만 저장할 수 있습니다.";
  }
  const serialized = JSON.stringify(value);
  // Schema IDs are UUIDs and can randomly contain a phone-shaped digit run.
  // Remove only complete RFC 4122 UUIDs before scanning user-visible payload
  // values so the PII guard remains strict without nondeterministic false hits.
  const piiScanText = serialized.replace(UUID_PATTERN, "<uuid>");
  if (PII_PATTERN.test(piiScanText)) {
    return "이메일 또는 휴대전화번호 형태의 값은 저장할 수 없습니다.";
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_SESSION_BYTES) {
    return "세션 크기가 2MB 제한을 초과했습니다.";
  }
  return undefined;
}

export function createMemoryOperationsSessionStore() {
  return new Map();
}

export async function handleOperationsSessionRequest(
  request,
  options = {},
) {
  const courierId = courierIdFromUrl(request);
  const workspaceId = sessionIdFromUrl(request);
  if (!workspaceId && !courierId) return undefined;
  if (courierId) {
    if (!COURIER_ID.test(courierId)) {
      return json({ error: "유효하지 않은 합성 기사 ID입니다." }, 400);
    }
    if (request.method !== "GET") {
      return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    }
  }
  if (!WORKSPACE_ID.test(workspaceId)) {
    if (courierId) {
      const database = options.database;
      const memoryStore = options.memoryStore;
      if (!database && !memoryStore) {
        return json({ error: "운영 상태 저장소가 연결되지 않았습니다." }, 503);
      }
      if (database) {
        await ensureSchema(database);
        const row = await database
          .prepare(
            `SELECT s.payload_json, s.updated_at, p.decision_id, p.participant_role
             FROM operations_session_participants p
             INNER JOIN operations_sessions s ON s.workspace_id = p.workspace_id
             WHERE p.courier_id = ?1
             ORDER BY p.updated_at DESC, p.workspace_id DESC
             LIMIT 1`,
          )
          .bind(courierId)
          .first();
        if (!row) return noLinkedSession();
        if (matchesVersion(request, row.updated_at)) {
          return notModified(row.updated_at);
        }
        return sessionJson({
          session: JSON.parse(row.payload_json),
          decisionId: row.decision_id,
          participantRole: row.participant_role,
          updatedAt: row.updated_at,
          storage: "D1",
        }, row.updated_at);
      }
      const latest = latestMemorySessionForCourier(memoryStore, courierId);
      if (!latest) return noLinkedSession();
      if (matchesVersion(request, latest.session.savedAt)) {
        return notModified(latest.session.savedAt);
      }
      return sessionJson({
        session: latest.session,
        decisionId: latest.participant.decisionId,
        participantRole: latest.participant.participantRole,
        updatedAt: latest.session.savedAt,
        storage: "MEMORY_DEV",
      }, latest.session.savedAt);
    }
    return json({ error: "유효하지 않은 합성 workspace ID입니다." }, 400);
  }
  if (!["GET", "PUT"].includes(request.method)) {
    return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
  }

  const database = options.database;
  const memoryStore = options.memoryStore;
  if (!database && !memoryStore) {
    return json(
      {
        error:
          "운영 상태 저장소가 연결되지 않았습니다. 계산과 내보내기는 계속 사용할 수 있습니다.",
      },
      503,
    );
  }

  if (request.method === "GET") {
    if (database) {
      await ensureSchema(database);
      const row = await database
        .prepare(
          `SELECT payload_json, updated_at
           FROM operations_sessions
           WHERE workspace_id = ?1`,
        )
        .bind(workspaceId)
        .first();
      if (!row) return json({ error: "저장된 운영 세션이 없습니다." }, 404);
      if (matchesVersion(request, row.updated_at)) {
        return notModified(row.updated_at);
      }
      return sessionJson({
        session: JSON.parse(row.payload_json),
        updatedAt: row.updated_at,
        storage: "D1",
      }, row.updated_at);
    }
    const session = memoryStore.get(workspaceId);
    if (!session) return json({ error: "저장된 운영 세션이 없습니다." }, 404);
    if (matchesVersion(request, session.savedAt)) {
      return notModified(session.savedAt);
    }
    return sessionJson({
      session,
      updatedAt: session.savedAt,
      storage: "MEMORY_DEV",
    }, session.savedAt);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "JSON 세션을 읽지 못했습니다." }, 400);
  }
  const validationError = validatePayload(workspaceId, payload);
  if (validationError) return json({ error: validationError }, 400);

  const serialized = JSON.stringify(payload);
  if (database) {
    await ensureSchema(database);
    const existing = await database
      .prepare(
        `SELECT updated_at
         FROM operations_sessions
         WHERE workspace_id = ?1`,
      )
      .bind(workspaceId)
      .first();
    const expectedSavedAt = request.headers.get(
      "x-saferoute-base-saved-at",
    );
    if (
      (existing && expectedSavedAt !== existing.updated_at) ||
      (!existing && expectedSavedAt)
    ) {
      return json(
        {
          error:
            "다른 화면에서 운영 상태가 갱신되었습니다. 최신 상태를 다시 불러오세요.",
          code: "SESSION_CONFLICT",
          updatedAt: existing?.updated_at,
        },
        409,
      );
    }
    const participants = sessionParticipants(payload);
    await database.batch([
      database.prepare(
        `INSERT INTO operations_sessions (
          workspace_id,
          snapshot_id,
          operation_date,
          payload_json,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(workspace_id) DO UPDATE SET
          snapshot_id = excluded.snapshot_id,
          operation_date = excluded.operation_date,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        workspaceId,
        payload.snapshotIdentity.snapshotId,
        payload.operationsPackage.operationDate,
        serialized,
        payload.savedAt,
      ),
      database
        .prepare(
          `DELETE FROM operations_session_participants
           WHERE workspace_id = ?1`,
        )
        .bind(workspaceId),
      ...participants.map((participant) =>
        database
          .prepare(
            `INSERT INTO operations_session_participants (
              workspace_id,
              decision_id,
              courier_id,
              participant_role,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5)`,
          )
          .bind(
            workspaceId,
            participant.decisionId,
            participant.courierId,
            participant.participantRole,
            payload.savedAt,
          ),
      ),
    ]);
  } else {
    const existing = memoryStore.get(workspaceId);
    const expectedSavedAt = request.headers.get(
      "x-saferoute-base-saved-at",
    );
    if (
      (existing && expectedSavedAt !== existing.savedAt) ||
      (!existing && expectedSavedAt)
    ) {
      return json(
        {
          error:
            "다른 화면에서 운영 상태가 갱신되었습니다. 최신 상태를 다시 불러오세요.",
          code: "SESSION_CONFLICT",
          updatedAt: existing?.savedAt,
        },
        409,
      );
    }
    memoryStore.set(workspaceId, payload);
  }
  return json({
    saved: true,
    workspaceId,
    snapshotId: payload.snapshotIdentity.snapshotId,
    updatedAt: payload.savedAt,
    storage: database ? "D1" : "MEMORY_DEV",
  });
}
