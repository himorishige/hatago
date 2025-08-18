/**
 * Session management types for MCP multi-user support
 */

/**
 * Session data structure
 */
export interface SessionData {
  /** Unique session identifier */
  id: string
  /** Session creation timestamp */
  createdAt: number
  /** Last access timestamp */
  lastAccessedAt: number
  /** Session expiration timestamp */
  expiresAt: number
  /** Plugin-specific data storage */
  data: Map<string, unknown>
}

/**
 * Functional session store interface
 */
export interface SessionStore {
  /** Get session by ID */
  get: (id: string) => SessionData | undefined
  /** Set session data */
  set: (id: string, data: SessionData) => void
  /** Delete session */
  delete: (id: string) => void
  /** Rotate session ID (move data from old to new ID, delete old) */
  rotate: (oldId: string, newId: string) => boolean
  /** Cleanup expired sessions */
  cleanup: () => void
  /** Destroy store and cleanup resources */
  destroy: () => void
  /** Get current session count */
  size: () => number
}

/**
 * Session store configuration
 */
export interface SessionStoreConfig {
  /** Session TTL in milliseconds (default: 30 minutes) */
  ttlMs?: number
  /** Cleanup interval in milliseconds (default: 1 minute) */
  cleanupIntervalMs?: number
  /** Maximum number of sessions (default: 1000) */
  maxSessions?: number
}
