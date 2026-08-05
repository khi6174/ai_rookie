CREATE TABLE IF NOT EXISTS operations_sessions (
  workspace_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  operation_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS operations_sessions_updated_at_idx
ON operations_sessions(updated_at);

CREATE TABLE IF NOT EXISTS operations_session_participants (
  workspace_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  courier_id TEXT NOT NULL,
  participant_role TEXT NOT NULL CHECK (participant_role IN ('SOURCE', 'RECIPIENT')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, decision_id, courier_id),
  FOREIGN KEY (workspace_id) REFERENCES operations_sessions(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_operations_session_participants_courier
ON operations_session_participants(courier_id, updated_at DESC);

PRAGMA optimize;
