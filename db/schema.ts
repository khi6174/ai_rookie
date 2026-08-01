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
