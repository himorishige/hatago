/**
 * Unified session manager for MCP multi-user support
 * Addresses race conditions between transport and session store management
 */
import { StreamableHTTPTransport } from '@hatago/hono-mcp'
import { createDefaultLogger } from '../logger/index.js'
import { createSessionStore, generateSessionId } from './index.js'
import type { SessionData } from './types.js'

const logger = createDefaultLogger('session-manager')

/**
 * Session record that bundles transport, data, and metadata together
 */
interface SessionRecord {
  id: string
  transport: StreamableHTTPTransport
  data: SessionData
  createdAt: number
  lastAccessedAt: number
  expiresAt: number
}

/**
 * Configuration for SessionManager
 */
export interface SessionManagerConfig {
  /** Session TTL in milliseconds (default: 30 minutes) */
  ttlMs?: number
  /** Cleanup interval in milliseconds (default: 1 minute) */
  cleanupIntervalMs?: number
  /** Maximum number of sessions (default: 1000) */
  maxSessions?: number
}

/**
 * Unified session manager that prevents race conditions
 * by managing transport and session data as a single atomic unit
 */
export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly config: Required<SessionManagerConfig>
  private readonly cleanupIntervalId: number
  private isDestroyed = false

  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      ttlMs: config.ttlMs ?? 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60 * 1000, // 1 minute
      maxSessions: config.maxSessions ?? 1000,
    }

    // Start cleanup timer
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupIntervalMs) as unknown as number

    logger.info('SessionManager created', {
      ttlMs: this.config.ttlMs,
      cleanupIntervalMs: this.config.cleanupIntervalMs,
      maxSessions: this.config.maxSessions,
    })
  }

  /**
   * Create a new session with transport
   * @param sessionIdGenerator Function to generate session IDs
   * @returns Created session record
   */
  createSession(sessionIdGenerator: () => string = generateSessionId): SessionRecord {
    if (this.isDestroyed) {
      throw new Error('SessionManager has been destroyed')
    }

    // Enforce session limit
    if (this.sessions.size >= this.config.maxSessions) {
      this.evictOldestSession()
    }

    const sessionId = sessionIdGenerator()
    const now = Date.now()

    // Create transport for this session
    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: () => {
        // Session initialization handled by this manager
        logger.debug('Transport session initialized')
      },
    })

    // Create session data
    const sessionData: SessionData = {
      id: sessionId,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + this.config.ttlMs,
      data: new Map(),
    }

    // Create unified session record
    const sessionRecord: SessionRecord = {
      id: sessionId,
      transport,
      data: sessionData,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + this.config.ttlMs,
    }

    // Atomic operation: add to sessions map
    this.sessions.set(sessionId, sessionRecord)

    logger.info('Session created', {
      totalSessions: this.sessions.size,
      expiresAt: new Date(sessionRecord.expiresAt).toISOString(),
    })

    return sessionRecord
  }

  /**
   * Get session by ID with TTL validation
   * @param sessionId Session ID to retrieve
   * @returns Session record if valid, undefined if not found or expired
   */
  getSession(sessionId: string): SessionRecord | undefined {
    if (this.isDestroyed) {
      return undefined
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      return undefined
    }

    const now = Date.now()

    // Check if session has expired
    if (now > session.expiresAt) {
      this.deleteSession(sessionId)
      logger.debug('Session expired and removed')
      return undefined
    }

    // Update last access time (both in record and data)
    session.lastAccessedAt = now
    session.data.lastAccessedAt = now

    return session
  }

  /**
   * Rotate session ID for security (prevents session fixation attacks)
   * @param oldSessionId Current session ID
   * @param newSessionId New session ID
   * @returns true if rotation successful, false if old session not found
   */
  rotateSession(oldSessionId: string, newSessionId: string): boolean {
    if (this.isDestroyed) {
      return false
    }

    const oldSession = this.sessions.get(oldSessionId)
    if (!oldSession) {
      return false
    }

    const now = Date.now()

    // Create new session data with same content but new ID
    const newSessionData: SessionData = {
      ...oldSession.data,
      id: newSessionId,
      lastAccessedAt: now,
      expiresAt: now + this.config.ttlMs, // Extend expiration
    }

    // Create new transport for rotated session
    const newTransport = new StreamableHTTPTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: () => {
        logger.debug('Rotated transport session initialized')
      },
    })

    // Create new session record
    const newSessionRecord: SessionRecord = {
      id: newSessionId,
      transport: newTransport,
      data: newSessionData,
      createdAt: oldSession.createdAt, // Keep original creation time
      lastAccessedAt: now,
      expiresAt: now + this.config.ttlMs,
    }

    // Atomic operation: add new session and remove old
    this.sessions.set(newSessionId, newSessionRecord)
    this.sessions.delete(oldSessionId)

    // Close old transport
    if (oldSession.transport && typeof (oldSession.transport as any).close === 'function') {
      try {
        ;(oldSession.transport as any).close()
      } catch (error) {
        logger.warn('Failed to close old transport during rotation', { error })
      }
    }

    logger.info('Session rotated for security', {
      reason: 'authentication_upgrade',
      totalSessions: this.sessions.size,
    })

    return true
  }

  /**
   * Delete session by ID
   * @param sessionId Session ID to delete
   * @returns true if session was deleted, false if not found
   */
  deleteSession(sessionId: string): boolean {
    if (this.isDestroyed) {
      return false
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      return false
    }

    // Close transport
    if (session.transport && typeof (session.transport as any).close === 'function') {
      try {
        ;(session.transport as any).close()
      } catch (error) {
        logger.warn('Failed to close transport during deletion', { error })
      }
    }

    // Remove from sessions map
    this.sessions.delete(sessionId)

    logger.debug('Session deleted', {
      totalSessions: this.sessions.size,
    })

    return true
  }

  /**
   * Update plugin data for a session
   * @param sessionId Session ID
   * @param pluginKey Plugin namespace key
   * @param data Plugin data to store
   */
  setPluginData(sessionId: string, pluginKey: string, data: unknown): boolean {
    const session = this.getSession(sessionId)
    if (!session) {
      return false
    }

    session.data.data.set(pluginKey, data)
    return true
  }

  /**
   * Get plugin data for a session
   * @param sessionId Session ID
   * @param pluginKey Plugin namespace key
   * @returns Plugin data or undefined
   */
  getPluginData(sessionId: string, pluginKey: string): unknown {
    const session = this.getSession(sessionId)
    if (!session) {
      return undefined
    }

    return session.data.data.get(pluginKey)
  }

  /**
   * Delete plugin data for a session
   * @param sessionId Session ID
   * @param pluginKey Plugin namespace key
   */
  deletePluginData(sessionId: string, pluginKey: string): boolean {
    const session = this.getSession(sessionId)
    if (!session) {
      return false
    }

    return session.data.data.delete(pluginKey)
  }

  /**
   * Get current session count
   */
  size(): number {
    return this.sessions.size
  }

  /**
   * Cleanup expired sessions
   */
  private cleanup(): void {
    if (this.isDestroyed) {
      return
    }

    const now = Date.now()
    let cleanedCount = 0

    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.deleteSession(sessionId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired sessions', {
        cleanedCount,
        remainingSessions: this.sessions.size,
      })
    }
  }

  /**
   * Evict oldest session when limit is reached
   */
  private evictOldestSession(): void {
    let oldestSessionId: string | undefined
    let oldestTime = Number.POSITIVE_INFINITY

    for (const [sessionId, session] of this.sessions) {
      if (session.lastAccessedAt < oldestTime) {
        oldestTime = session.lastAccessedAt
        oldestSessionId = sessionId
      }
    }

    if (oldestSessionId) {
      this.deleteSession(oldestSessionId)
      logger.warn('Session limit reached, evicted oldest session', {
        maxSessions: this.config.maxSessions,
        remainingSessions: this.sessions.size,
      })
    }
  }

  /**
   * Destroy session manager and cleanup all resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true

    // Stop cleanup timer
    clearInterval(this.cleanupIntervalId)

    // Close all transports and clear sessions
    for (const [_sessionId, session] of this.sessions) {
      if (session.transport && typeof (session.transport as any).close === 'function') {
        try {
          ;(session.transport as any).close()
        } catch (error) {
          logger.warn('Failed to close transport during destroy', { error })
        }
      }
    }

    this.sessions.clear()

    logger.info('SessionManager destroyed', {
      finalSessionCount: 0,
    })
  }
}
