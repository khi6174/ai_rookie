import { applySyntheticCourierDirectory } from "./synthetic-courier-directory.mjs";

const CURRENT_DAY_PATH = "/api/operations/days/current";
const CURRENT_PACKAGE_PATH = "/api/operations/days/current/package";
const PII_PATTERN =
  /01[016789][-\s]?\d{3,4}[-\s]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function requestKind(request) {
  const path = new URL(request.url).pathname;
  if (path === CURRENT_DAY_PATH) return "DAY";
  if (path === CURRENT_PACKAGE_PATH) return "PACKAGE";
  return undefined;
}

function parentRecordNumber(record) {
  return Number(record.parentRecordId.split("-").at(-1));
}

function normalizeBundle(rawBundle) {
  if (
    !rawBundle ||
    rawBundle.schemaVersion !== "daily-operations-document-bundle-v1" ||
    rawBundle.dataMode !== "SYNTHETIC" ||
    !Array.isArray(rawBundle.extractedRecords) ||
    rawBundle.extractedRecords.length === 0
  ) {
    throw new Error("검증된 합성 운영 문서 번들이 필요합니다.");
  }
  const records = applySyntheticCourierDirectory(
    [...rawBundle.extractedRecords].sort(
      (left, right) => parentRecordNumber(left) - parentRecordNumber(right),
    ),
  );
  const courierIds = new Set();
  const parentRecordIds = new Set();
  const stopIds = new Set();
  for (const record of records) {
    if (
      record?.schemaVersion !== "synthetic-operations-parent-v1" ||
      record.dataMode !== "SYNTHETIC" ||
      record.provenance?.kind !== "MOCK" ||
      record.provenance?.isDemo !== true ||
      record.generator?.validationStatus !== "ACCEPTED" ||
      record.safetyObservation?.accidentOccurred !== false ||
      record.safetyObservation?.nonPunitive !== true
    ) {
      throw new Error("합성 운영 레코드의 안전·출처 계약이 유효하지 않습니다.");
    }
    if (
      courierIds.has(record.courier.courierId) ||
      parentRecordIds.has(record.parentRecordId)
    ) {
      throw new Error("합성 기사 또는 상위 레코드 ID가 중복되었습니다.");
    }
    courierIds.add(record.courier.courierId);
    parentRecordIds.add(record.parentRecordId);
    if (
      record.plan.completedStopCount + record.plan.remainingStopCount !==
        record.plan.totalStopCount ||
      record.plan.stops.length !== record.plan.remainingStopCount
    ) {
      throw new Error("합성 배송 수량 계약이 유효하지 않습니다.");
    }
    for (const stop of record.plan.stops) {
      if (stopIds.has(stop.stopId)) {
        throw new Error("합성 배송지 ID가 중복되었습니다.");
      }
      stopIds.add(stop.stopId);
    }
  }
  const operationsPackage = {
    schemaVersion: "daily-operations-package-v1",
    packageId: `${rawBundle.bundleId}-named-v2`,
    operationDate: rawBundle.operationDate,
    evaluatedAt: rawBundle.evaluatedAt,
    timeZone: rawBundle.timeZone,
    dataMode: rawBundle.dataMode,
    source: rawBundle.source,
    records,
  };
  if (PII_PATTERN.test(JSON.stringify(operationsPackage))) {
    throw new Error("합성 운영 패키지에 연락처 형태의 값이 포함되었습니다.");
  }
  return {
    sourceBundleId: rawBundle.bundleId,
    operationsPackage,
  };
}

function projectionFor(seed, storage) {
  const { operationsPackage } = seed;
  return {
    schemaVersion: "synthetic-operation-day-projection-v1",
    packageId: operationsPackage.packageId,
    operationDate: operationsPackage.operationDate,
    evaluatedAt: operationsPackage.evaluatedAt,
    timeZone: operationsPackage.timeZone,
    dataMode: operationsPackage.dataMode,
    source: operationsPackage.source,
    courierCount: operationsPackage.records.length,
    remainingStopCount: operationsPackage.records.reduce(
      (total, record) => total + record.plan.remainingStopCount,
      0,
    ),
    datasetVersions: [
      ...new Set(
        operationsPackage.records.map((record) => record.datasetVersion),
      ),
    ].sort(),
    storage,
  };
}

async function runBatches(database, statements, size = 40) {
  for (let index = 0; index < statements.length; index += size) {
    await database.batch(statements.slice(index, index + size));
  }
}

async function ensureSchema(database) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS synthetic_operation_days (
      package_id TEXT PRIMARY KEY,
      source_bundle_id TEXT NOT NULL,
      operation_date TEXT NOT NULL,
      evaluated_at TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      data_mode TEXT NOT NULL CHECK (data_mode = 'SYNTHETIC'),
      source TEXT NOT NULL,
      courier_count INTEGER NOT NULL,
      remaining_stop_count INTEGER NOT NULL,
      seeded_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS synthetic_courier_records (
      parent_record_id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      dataset_version TEXT NOT NULL,
      courier_id TEXT NOT NULL,
      display_label TEXT NOT NULL,
      hub_id TEXT NOT NULL,
      hub_label TEXT NOT NULL,
      shift_id TEXT NOT NULL,
      shift_start_at TEXT NOT NULL,
      shift_end_at TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      plan_version TEXT NOT NULL,
      completed_stop_count INTEGER NOT NULL,
      total_stop_count INTEGER NOT NULL,
      remaining_stop_count INTEGER NOT NULL,
      record_json TEXT NOT NULL,
      FOREIGN KEY (package_id) REFERENCES synthetic_operation_days(package_id),
      UNIQUE (package_id, courier_id)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS synthetic_delivery_stops (
      stop_id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      parent_record_id TEXT NOT NULL,
      courier_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      eta TEXT NOT NULL,
      coarse_zone TEXT NOT NULL,
      task_type TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      FOREIGN KEY (package_id) REFERENCES synthetic_operation_days(package_id),
      FOREIGN KEY (parent_record_id) REFERENCES synthetic_courier_records(parent_record_id),
      UNIQUE (parent_record_id, sequence)
    )`),
    database.prepare(`CREATE INDEX IF NOT EXISTS idx_synthetic_operation_days_date
      ON synthetic_operation_days(operation_date DESC)`),
    database.prepare(`CREATE INDEX IF NOT EXISTS idx_synthetic_courier_records_package
      ON synthetic_courier_records(package_id, courier_id)`),
    database.prepare(`CREATE INDEX IF NOT EXISTS idx_synthetic_delivery_stops_courier
      ON synthetic_delivery_stops(package_id, courier_id, sequence)`),
  ]);
}

async function verifyPersistedCounts(database, packageId, expected) {
  const [recordCount, stopCount] = await Promise.all([
    database
      .prepare(
        `SELECT COUNT(*) AS value FROM synthetic_courier_records
         WHERE package_id = ?1`,
      )
      .bind(packageId)
      .first(),
    database
      .prepare(
        `SELECT COUNT(*) AS value FROM synthetic_delivery_stops
         WHERE package_id = ?1`,
      )
      .bind(packageId)
      .first(),
  ]);
  if (
    Number(recordCount?.value) !== expected.courierCount ||
    Number(stopCount?.value) !== expected.remainingStopCount
  ) {
    throw new Error(
      "합성 운영 DB 시드가 불완전합니다. 승인 seed로 다시 초기화해야 합니다.",
    );
  }
}

async function ensureSeed(database, seed) {
  const packageId = seed.operationsPackage.packageId;
  const existing = await database
    .prepare(
      `SELECT courier_count, remaining_stop_count
       FROM synthetic_operation_days WHERE package_id = ?1`,
    )
    .bind(packageId)
    .first();
  const expected = projectionFor(seed, "D1");
  if (existing) {
    if (
      Number(existing.courier_count) !== expected.courierCount ||
      Number(existing.remaining_stop_count) !== expected.remainingStopCount
    ) {
      throw new Error("저장된 합성 운영일과 승인 seed의 수량이 다릅니다.");
    }
    await verifyPersistedCounts(database, packageId, expected);
    return;
  }
  const seededAt = new Date().toISOString();
  await database
    .prepare(`INSERT INTO synthetic_operation_days (
      package_id, source_bundle_id, operation_date, evaluated_at, time_zone,
      data_mode, source, courier_count, remaining_stop_count, seeded_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
    .bind(
      packageId,
      seed.sourceBundleId,
      seed.operationsPackage.operationDate,
      seed.operationsPackage.evaluatedAt,
      seed.operationsPackage.timeZone,
      seed.operationsPackage.dataMode,
      seed.operationsPackage.source,
      expected.courierCount,
      expected.remainingStopCount,
      seededAt,
    )
    .run();
  const recordStatements = seed.operationsPackage.records.map((record) =>
    database
      .prepare(`INSERT INTO synthetic_courier_records (
        parent_record_id, package_id, dataset_version, courier_id,
        display_label, hub_id, hub_label, shift_id, shift_start_at,
        shift_end_at, vehicle_id, plan_id, plan_version,
        completed_stop_count, total_stop_count, remaining_stop_count,
        record_json
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`)
      .bind(
        record.parentRecordId,
        packageId,
        record.datasetVersion,
        record.courier.courierId,
        record.courier.displayLabel,
        record.hub.hubId,
        record.hub.label,
        record.shift.shiftId,
        record.shift.startAt,
        record.shift.endAt,
        record.vehicle.vehicleId,
        record.plan.planId,
        record.plan.planVersion,
        record.plan.completedStopCount,
        record.plan.totalStopCount,
        record.plan.remainingStopCount,
        JSON.stringify(record),
      ),
  );
  await runBatches(database, recordStatements);
  const stopStatements = seed.operationsPackage.records.flatMap((record) =>
    record.plan.stops.map((stop) =>
      database
        .prepare(`INSERT INTO synthetic_delivery_stops (
          stop_id, package_id, parent_record_id, courier_id, sequence,
          eta, coarse_zone, task_type, weight_kg
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
        .bind(
          stop.stopId,
          packageId,
          record.parentRecordId,
          record.courier.courierId,
          stop.sequence,
          stop.eta,
          stop.coarseZone,
          stop.taskType,
          stop.weightKg,
        ),
    ),
  );
  await runBatches(database, stopStatements);
  await verifyPersistedCounts(database, packageId, expected);
}

async function readPackage(database, seed) {
  const result = await database
    .prepare(
      `SELECT record_json FROM synthetic_courier_records
       WHERE package_id = ?1 ORDER BY parent_record_id`,
    )
    .bind(seed.operationsPackage.packageId)
    .all();
  return {
    ...seed.operationsPackage,
    records: result.results.map((row) => JSON.parse(row.record_json)),
  };
}

export function createMemorySyntheticOperationsStore(rawBundle) {
  const seed = normalizeBundle(rawBundle);
  return {
    seed,
    projection: projectionFor(seed, "MEMORY_DEV"),
  };
}

export async function handleSyntheticOperationsRequest(request, options = {}) {
  const kind = requestKind(request);
  if (!kind) return undefined;
  if (request.method !== "GET") {
    return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
  }
  try {
    if (options.database) {
      const seed = normalizeBundle(options.bundle);
      await ensureSchema(options.database);
      await ensureSeed(options.database, seed);
      if (kind === "DAY") {
        return json({ day: projectionFor(seed, "D1") });
      }
      return json({
        package: await readPackage(options.database, seed),
        storage: "D1",
        sourceBundleId: seed.sourceBundleId,
        rawDocumentsStored: false,
      });
    }
    if (options.memoryStore) {
      if (kind === "DAY") return json({ day: options.memoryStore.projection });
      return json({
        package: options.memoryStore.seed.operationsPackage,
        storage: "MEMORY_DEV",
        sourceBundleId: options.memoryStore.seed.sourceBundleId,
        rawDocumentsStored: false,
      });
    }
    return json({ error: "합성 운영 DB가 연결되지 않았습니다." }, 503);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "합성 운영 DB를 확인하지 못했습니다.",
      },
      500,
    );
  }
}
