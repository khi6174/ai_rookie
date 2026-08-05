CREATE TABLE IF NOT EXISTS operations_rider_danger_signals (
  courier_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operations_rider_danger_signals_expires
ON operations_rider_danger_signals(expires_at);

PRAGMA optimize;
