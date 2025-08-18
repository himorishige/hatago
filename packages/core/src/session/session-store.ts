import { createDefaultLogger } from '../logger/index.js'
/**
 * Functional session store implementation using Web Standards APIs only
 */
import type { SessionData, SessionStore, SessionStoreConfig } from './types.js'

const logger = createDefaultLogger('session-store')

/**
 * Create a functional session store with automatic cleanup
 * @param config Session store configuration
 * @returns Session store instance
 */
export function createSessionStore(config: SessionStoreConfig = {}): SessionStore {
  const {
    ttlMs = 30 * 60 * 1000, // 30 minutes
    cleanupIntervalMs = 60 * 1000, // 1 minute
    maxSessions = 1000,
  } = config

  const sessions = new Map<string, SessionData>()

  // Web Standards setInterval (returns number, not NodeJS.Timer)
  const cleanupIntervalId = setInterval(() => {
    cleanup()
  }, cleanupIntervalMs) as unknown as number

  /**
   * Get session by ID with TTL check
   */
  const get = (id: string): SessionData | undefined => {
    const session = sessions.get(id)
    if (!session) {
      return undefined
    }

    const now = Date.now()

    // Check if session has expired
    if (now > session.expiresAt) {
      sessions.delete(id)
      logger.debug('Session expired and removed')
      return undefined
    }

    // Update last access time
    session.lastAccessedAt = now
    return session
  }

  /**
   * Set session data with capacity check
   */
  const set = (id: string, data: SessionData): void => {
    // Check session limit
    if (!sessions.has(id) && sessions.size >= maxSessions) {
      // Remove oldest session
      let oldestId: string | undefined
      let oldestTime = Number.POSITIVE_INFINITY

      for (const [sessionId, session] of sessions) {
        if (session.lastAccessedAt < oldestTime) {
          oldestTime = session.lastAccessedAt
          oldestId = sessionId
        }
      }

      if (oldestId) {
        sessions.delete(oldestId)
        logger.warn('Session limit reached, removed oldest session', {
          maxSessions,
        })
      }
    }

    sessions.set(id, data)
    logger.debug('Session stored', {
      expiresAt: new Date(data.expiresAt).toISOString(),
    })
  }

  /**
   * Delete session by ID
   */
  const deleteSession = (id: string): void => {
    const existed = sessions.delete(id)
    if (existed) {
      logger.debug('Session deleted')
    }
  }

  /**
   * Cleanup expired sessions
   */
  const cleanup = (): void => {
    const now = Date.now()
    let cleanedCount = 0

    for (const [id, session] of sessions) {
      if (now > session.expiresAt) {
        sessions.delete(id)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired sessions', {
        cleanedCount,
        remainingSessions: sessions.size,
      })
    }
  }

  /**
   * Destroy store and cleanup resources
   */
  const destroy = (): void => {
    clearInterval(cleanupIntervalId)
    sessions.clear()
    logger.info('Session store destroyed', { finalSessionCount: 0 })
  }

  /**
   * Rotate session ID (move data from old to new ID)
   * Used for session fixation attack prevention
   */
  const rotate = (oldId: string, newId: string): boolean => {
    const oldSession = sessions.get(oldId)
    if (!oldSession) {
      return false
    }

    // Create new session with same data but new ID
    const newSession: SessionData = {
      ...oldSession,
      id: newId,
      lastAccessedAt: Date.now(),
      // Extend expiration time for rotated session
      expiresAt: Date.now() + ttlMs,
    }

    // Atomic operation: set new session first, then delete old
    sessions.set(newId, newSession)
    sessions.delete(oldId)

    // NO LOGGING of session IDs for security
    logger.info('Session rotated for security', {
      reason: 'authentication_upgrade',
    })

    return true
  }

  /**
   * Get current session count
   */
  const size = (): number => sessions.size

  logger.info('Session store created', {
    ttlMs,
    cleanupIntervalMs,
    maxSessions,
  })

  return {
    get,
    set,
    delete: deleteSession,
    rotate,
    cleanup,
    destroy,
    size,
  }
}
