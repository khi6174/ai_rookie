import { riderProfiles } from "./rider-profiles.mjs";

const RIDER_ID = /^R-\d{3}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function riderIdFromUrl(request) {
  const path = new URL(request.url).pathname;
  if (path === "/api/riders") return null;
  const match = path.match(/^\/api\/riders\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function ensureSchema(database) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS rider_profiles (
      courier_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      area_code TEXT NOT NULL,
      delivery_zone TEXT NOT NULL,
      completed_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      shift_start TEXT NOT NULL,
      expected_completion TEXT NOT NULL,
      safety_score REAL NOT NULL,
      projected_safety_score REAL,
      critical_minute INTEGER,
      critical_stop_ordinal INTEGER,
      map_x REAL NOT NULL,
      map_y REAL NOT NULL,
      hub_label TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE INDEX IF NOT EXISTS idx_rider_profiles_area_code
      ON rider_profiles(area_code)`),
  ]);
  const countRow = await database.prepare("SELECT COUNT(*) AS count FROM rider_profiles").first();
  if (Number(countRow?.count ?? 0) > 0) return;
  const updatedAt = new Date().toISOString();
  await database.batch(riderProfiles.map((profile) => database.prepare(`INSERT INTO rider_profiles (
    courier_id, display_name, area_code, delivery_zone, completed_count,
    total_count, shift_start, expected_completion, safety_score,
    projected_safety_score, critical_minute, critical_stop_ordinal, map_x, map_y, hub_label,
    vehicle_id, updated_at
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`)
    .bind(
      profile.courierId,
      profile.displayName,
      profile.areaCode,
      profile.deliveryZone,
      profile.completedCount,
      profile.totalCount,
      profile.shiftStart,
      profile.expectedCompletion,
      profile.safetyScore,
      profile.projectedSafetyScore ?? profile.safetyScore,
      profile.criticalMinute,
      profile.criticalStopOrdinal,
      profile.mapX,
      profile.mapY,
      profile.hubLabel,
      profile.vehicleId,
      updatedAt,
    )));
}

function rowToProfile(row) {
  return {
    courierId: row.courier_id,
    displayName: row.display_name,
    areaCode: row.area_code,
    deliveryZone: row.delivery_zone,
    completedCount: Number(row.completed_count),
    totalCount: Number(row.total_count),
    shiftStart: row.shift_start,
    expectedCompletion: row.expected_completion,
    safetyScore: Number(row.safety_score),
    projectedSafetyScore: row.projected_safety_score === null ? undefined : Number(row.projected_safety_score),
    criticalMinute: row.critical_minute === null ? null : Number(row.critical_minute),
    criticalStopOrdinal: row.critical_stop_ordinal === null ? null : Number(row.critical_stop_ordinal),
    mapX: Number(row.map_x),
    mapY: Number(row.map_y),
    hubLabel: row.hub_label,
    vehicleId: row.vehicle_id,
  };
}

export function createMemoryRiderProfileStore() {
  return new Map(riderProfiles.map((profile) => [profile.courierId, profile]));
}

export async function handleRiderProfileRequest(request, options = {}) {
  const riderId = riderIdFromUrl(request);
  if (riderId === undefined) return undefined;
  if (request.method !== "GET") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
  if (riderId !== null && !RIDER_ID.test(riderId)) return json({ error: "기사 ID 형식이 올바르지 않습니다." }, 400);

  const database = options.database;
  const memoryStore = options.memoryStore;
  if (!database && !memoryStore) return json({ error: "기사 데이터 저장소가 연결되지 않았습니다." }, 503);

  if (database) {
    await ensureSchema(database);
    if (riderId === null) {
      const result = await database.prepare("SELECT * FROM rider_profiles ORDER BY courier_id").all();
      return json({ riders: result.results.map(rowToProfile), storage: "D1" });
    }
    const row = await database.prepare("SELECT * FROM rider_profiles WHERE courier_id = ?1").bind(riderId).first();
    return row ? json({ rider: rowToProfile(row), storage: "D1" }) : json({ error: "기사를 찾을 수 없습니다." }, 404);
  }

  if (riderId === null) return json({ riders: [...memoryStore.values()], storage: "MEMORY_DEV" });
  const rider = memoryStore.get(riderId);
  return rider ? json({ rider, storage: "MEMORY_DEV" }) : json({ error: "기사를 찾을 수 없습니다." }, 404);
}
