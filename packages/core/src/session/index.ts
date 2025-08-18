/**
 * Session management for MCP multi-user support
 * Provides runtime-agnostic session handling using Web Standards APIs
 */

export type { SessionData, SessionStore, SessionStoreConfig } from './types.js'
export { createSessionStore } from './session-store.js'
export { generateSessionId, isValidSessionId, secureCompareSessionId } from './secure-id.js'
export { SessionManager, type SessionManagerConfig } from './session-manager.js'
