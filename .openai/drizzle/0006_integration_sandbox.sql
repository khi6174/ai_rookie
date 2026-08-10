CREATE TABLE IF NOT EXISTS integration_sandbox_state (
  tenant_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integration_sandbox_state_site
  ON integration_sandbox_state(site_id, updated_at DESC);

PRAGMA optimize;
