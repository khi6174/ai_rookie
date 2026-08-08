CREATE TABLE IF NOT EXISTS shadow_live_progress_events (
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
);

CREATE INDEX IF NOT EXISTS idx_shadow_live_connection_sequence
ON shadow_live_progress_events(connection_id, sequence DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_live_expires
ON shadow_live_progress_events(expires_at);

PRAGMA optimize;
