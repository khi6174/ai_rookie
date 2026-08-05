const COLLECTION_PATH = "/api/operations/danger-signals";
const COURIER_ID = /^(?:R-\d{3}|demo-courier-\d{3})$/;
const SIGNAL_TTL_MS = 15 * 60_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function courierIdFromUrl(request) {
  const match = new URL(request.url).pathname.match(
    /^\/api\/operations\/danger-signals\/([^/]+)$/,
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

function timeLabel(now) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

function toSignal(row) {
  return {
    schemaVersion: "demo-rider-danger-signal-v1",
    courierId: row.courier_id,
    label: row.label,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    source: "SYNTHETIC_RIDER_APP",
  };
}

function versionFor(signals) {
  if (signals.length === 0) return "empty";
  const latest = signals.reduce(
    (value, signal) => signal.updatedAt > value ? signal.updatedAt : value,
    "",
  );
  return `${signals.length}:${latest}`;
}

function collectionResponse(signals, storage, request) {
  const version = versionFor(signals);
  const etag = `"${version}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { "Cache-Control": "no-store", ETag: etag },
    });
  }
  const response = json({
    schemaVersion: "demo-rider-danger-signal-collection-v1",
    signals: signals.map(({ updatedAt: _updatedAt, ...signal }) => signal),
    version,
    storage,
  });
  response.headers.set("ETag", etag);
  return response;
}

async function ensureSchema(database) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS operations_rider_danger_signals (
        courier_id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        received_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ),
    database.prepare(
      `CREATE INDEX IF NOT EXISTS idx_operations_rider_danger_signals_expires
       ON operations_rider_danger_signals(expires_at)`,
    ),
  ]);
}

export function createMemoryRiderDangerSignalStore() {
  return new Map();
}

export async function handleRiderDangerSignalRequest(request, options = {}) {
  const path = new URL(request.url).pathname;
  const courierId = courierIdFromUrl(request);
  if (path !== COLLECTION_PATH && !courierId) return undefined;

  const database = options.database;
  const memoryStore = options.memoryStore;
  if (!database && !memoryStore) {
    return json({ error: "응급 합성 신호 저장소가 연결되지 않았습니다." }, 503);
  }

  const now = options.now?.() ?? new Date();
  const nowIso = now.toISOString();

  if (path === COLLECTION_PATH) {
    if (request.method !== "GET") {
      return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
    }
    if (database) {
      await ensureSchema(database);
      const result = await database
        .prepare(
          `SELECT courier_id, label, received_at, created_at, expires_at, updated_at
           FROM operations_rider_danger_signals
           WHERE expires_at > ?1
           ORDER BY created_at DESC, courier_id ASC`,
        )
        .bind(nowIso)
        .all();
      const signals = (result?.results ?? []).map((row) => ({
        ...toSignal(row),
        updatedAt: row.updated_at,
      }));
      return collectionResponse(signals, "D1", request);
    }
    const signals = [...memoryStore.values()]
      .filter((signal) => signal.expiresAt > nowIso)
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.courierId.localeCompare(right.courierId),
      );
    return collectionResponse(signals, "MEMORY_DEV", request);
  }

  if (!COURIER_ID.test(courierId)) {
    return json({ error: "유효하지 않은 합성 기사 ID입니다." }, 400);
  }
  if (request.method !== "PUT") {
    return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
  }

  let command;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2_000) {
      return json({ error: "요청 크기가 제한을 초과했습니다." }, 413);
    }
    command = JSON.parse(raw);
  } catch {
    return json({ error: "요청 JSON을 읽을 수 없습니다." }, 400);
  }
  if (
    command?.schemaVersion !== "demo-rider-danger-signal-command-v1" ||
    command?.courierId !== courierId ||
    command?.source !== "SYNTHETIC_RIDER_APP"
  ) {
    return json({ error: "응급 합성 신호 계약이 올바르지 않습니다." }, 400);
  }

  const signal = {
    schemaVersion: "demo-rider-danger-signal-v1",
    courierId,
    label: "앱 감지 위험 신호",
    receivedAt: timeLabel(now),
    createdAt: nowIso,
    expiresAt: new Date(now.getTime() + SIGNAL_TTL_MS).toISOString(),
    source: "SYNTHETIC_RIDER_APP",
    updatedAt: nowIso,
  };

  if (database) {
    await ensureSchema(database);
    await database
      .prepare(
        `INSERT INTO operations_rider_danger_signals (
          courier_id, label, received_at, created_at, expires_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(courier_id) DO UPDATE SET
          label = excluded.label,
          received_at = excluded.received_at,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`,
      )
      .bind(
        signal.courierId,
        signal.label,
        signal.receivedAt,
        signal.createdAt,
        signal.expiresAt,
        signal.updatedAt,
      )
      .run();
  } else {
    memoryStore.set(courierId, signal);
  }

  return json({
    signal: (({ updatedAt: _updatedAt, ...storedSignal }) => storedSignal)(signal),
    storage: database ? "D1" : "MEMORY_DEV",
  }, 201);
}
