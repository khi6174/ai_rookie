CREATE TABLE IF NOT EXISTS synthetic_operation_days (
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
);

CREATE TABLE IF NOT EXISTS synthetic_courier_records (
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
);

CREATE TABLE IF NOT EXISTS synthetic_delivery_stops (
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
);

CREATE INDEX IF NOT EXISTS idx_synthetic_operation_days_date
ON synthetic_operation_days(operation_date DESC);

CREATE INDEX IF NOT EXISTS idx_synthetic_courier_records_package
ON synthetic_courier_records(package_id, courier_id);

CREATE INDEX IF NOT EXISTS idx_synthetic_delivery_stops_courier
ON synthetic_delivery_stops(package_id, courier_id, sequence);

PRAGMA optimize;
