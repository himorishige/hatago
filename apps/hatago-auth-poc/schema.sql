-- Hatago Auth POC Database Schema
-- D1 Database for user permissions and MCP server management

-- User permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT PRIMARY KEY,
  servers TEXT NOT NULL DEFAULT '[]',
  permissions TEXT NOT NULL DEFAULT '["read"]',
  groups TEXT NOT NULL DEFAULT '["users"]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Server registry for MCP servers
CREATE TABLE IF NOT EXISTS server_registry (
  server_id TEXT PRIMARY KEY,
  server_name TEXT NOT NULL,
  server_type TEXT NOT NULL,
  container_id TEXT,
  config TEXT,
  status TEXT DEFAULT 'inactive',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for tracking actions
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT,
  details TEXT,
  ip_address TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_permissions_updated ON user_permissions(updated_at);
CREATE INDEX IF NOT EXISTS idx_server_registry_status ON server_registry(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);

-- Sample data for development
INSERT OR IGNORE INTO user_permissions (user_id, servers, permissions, groups) VALUES 
  ('admin@example.com', '["*"]', '["read", "write", "execute", "admin"]', '["users", "admin"]'),
  ('user@example.com', '["demo-server"]', '["read", "write"]', '["users"]'),
  ('guest@example.com', '[]', '["read"]', '["users", "guests"]');

INSERT OR IGNORE INTO server_registry (server_id, server_name, server_type, status) VALUES
  ('demo-server', 'Demo MCP Server', 'stdio', 'active'),
  ('test-server', 'Test MCP Server', 'http', 'inactive');