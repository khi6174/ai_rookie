export const riderProfilesTableSql = `CREATE TABLE IF NOT EXISTS rider_profiles (
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
)`;

export const riderProfilesAreaIndexSql = `CREATE INDEX IF NOT EXISTS idx_rider_profiles_area_code
ON rider_profiles(area_code)`;

export const syntheticOperationDaysTableSql = `CREATE TABLE IF NOT EXISTS synthetic_operation_days (
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
)`;

export const syntheticCourierRecordsTableSql = `CREATE TABLE IF NOT EXISTS synthetic_courier_records (
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
)`;

export const syntheticDeliveryStopsTableSql = `CREATE TABLE IF NOT EXISTS synthetic_delivery_stops (
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
)`;

export const operationsSessionsTableSql = `CREATE TABLE IF NOT EXISTS operations_sessions (
  workspace_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  operation_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const operationsSessionParticipantsTableSql = `CREATE TABLE IF NOT EXISTS operations_session_participants (
  workspace_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  courier_id TEXT NOT NULL,
  participant_role TEXT NOT NULL CHECK (participant_role IN ('SOURCE', 'RECIPIENT')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, decision_id, courier_id),
  FOREIGN KEY (workspace_id) REFERENCES operations_sessions(workspace_id) ON DELETE CASCADE
)`;

export const operationsSessionParticipantsCourierIndexSql = `CREATE INDEX IF NOT EXISTS idx_operations_session_participants_courier
ON operations_session_participants(courier_id, updated_at DESC)`;

export const operationsRiderDangerSignalsTableSql = `CREATE TABLE IF NOT EXISTS operations_rider_danger_signals (
  courier_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const operationsRiderDangerSignalsExpiresIndexSql = `CREATE INDEX IF NOT EXISTS idx_operations_rider_danger_signals_expires
ON operations_rider_danger_signals(expires_at)`;
