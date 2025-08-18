import { createDefaultLogger } from '@hatago/core'
import { generateSecureId, secureCompare } from './secure-random.js'
/**
 * Session store for GitHub OAuth device flow
 * Manages authentication sessions with TTL and idle timeout
 */
import type { DeviceAuthSession, GitHubDeviceFlowConfig, GitHubToken } from './types.js'

const logger = createDefaultLogger('github-oauth-session')

export class SessionStore {
  private sessions = new Map<string, DeviceAuthSession>()
  private cleanupInterval: number
  private readonly ttl: number
  private readonly idleTimeout: number

  constructor(private config: GitHubDeviceFlowConfig) {
    this.ttl = (config.sessionTTL || 900) * 1000 // Default: 15 minutes
    this.idleTimeout = (config.idleTimeout || 300) * 1000 // Default: 5 minutes

    // Cleanup expired sessions every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) as unknown as number
  }

  /**
   * Create a new session
   * @returns Session ID
   */
  createSession(): string {
    const id = generateSecureId()
    const now = Date.now()

    const session: DeviceAuthSession = {
      id,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + this.ttl,
    }

    this.sessions.set(id, session)
    logger.debug('Session created', { sessionId: `${id.substring(0, 8)}...` })

    return id
  }

  /**
   * Get session by ID with TTL and idle timeout checks
   * @param id Session ID
   * @returns Session if valid, undefined otherwise
   */
  getSession(id: string): DeviceAuthSession | undefined {
    const session = this.sessions.get(id)

    if (!session) {
      logger.debug('Session not found')
      return undefined
    }

    const now = Date.now()

    // Check TTL
    if (now > session.expiresAt) {
      logger.debug('Session expired (TTL)', { sessionId: `${id.substring(0, 8)}...` })
      this.sessions.delete(id)
      return undefined
    }

    // Check idle timeout
    if (now - session.lastAccessedAt > this.idleTimeout) {
      logger.debug('Session expired (idle)', { sessionId: `${id.substring(0, 8)}...` })
      this.sessions.delete(id)
      return undefined
    }

    // Update last accessed time
    session.lastAccessedAt = now
    return session
  }

  /**
   * Validate session ID using timing-safe comparison
   * @param id Session ID to validate
   * @returns Session if valid, undefined otherwise
   */
  validateSession(id: string): DeviceAuthSession | undefined {
    // Find the session with timing-safe comparison
    for (const [storedId, _session] of this.sessions) {
      if (secureCompare(id, storedId)) {
        return this.getSession(storedId)
      }
    }
    return undefined
  }

  /**
   * Bind device code to session
   * @param sessionId Session ID
   * @param deviceCode GitHub device code
   * @param userCode User display code
   */
  bindDeviceCode(sessionId: string, deviceCode: string, userCode: string): void {
    const session = this.getSession(sessionId)
    if (session) {
      session.deviceCode = deviceCode
      session.userCode = userCode
      logger.debug('Device code bound to session', {
        sessionId: `${sessionId.substring(0, 8)}...`,
        userCode,
      })
    }
  }

  /**
   * Store GitHub token in session and clear device code
   * @param sessionId Session ID
   * @param token GitHub access token
   */
  storeToken(sessionId: string, token: GitHubToken): void {
    const session = this.getSession(sessionId)
    if (session) {
      session.githubToken = token
      // Immediately clear device code after token is obtained
      session.deviceCode = undefined
      session.userCode = undefined
      logger.info('Token stored in session', {
        sessionId: `${sessionId.substring(0, 8)}...`,
        scope: token.scope,
      })
    }
  }

  /**
   * Set user ID for session
   * @param sessionId Session ID
   * @param userId GitHub user ID
   */
  setUserId(sessionId: string, userId: string): void {
    const session = this.getSession(sessionId)
    if (session) {
      session.userId = userId
      logger.debug('User ID set for session', {
        sessionId: `${sessionId.substring(0, 8)}...`,
        userId,
      })
    }
  }

  /**
   * Delete a session
   * @param sessionId Session ID
   */
  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      // Clear sensitive data before deletion
      if (session.githubToken) {
        // Zero out token in memory (best effort)
        session.githubToken.access_token = ''
        session.githubToken = undefined
      }
      session.deviceCode = undefined
      session.userCode = undefined

      this.sessions.delete(sessionId)
      logger.debug('Session deleted', { sessionId: `${sessionId.substring(0, 8)}...` })
    }
  }

  /**
   * Cleanup expired sessions
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt || now - session.lastAccessedAt > this.idleTimeout) {
        this.deleteSession(id)
        cleaned++
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired sessions', { count: cleaned })
    }
  }

  /**
   * Get current session count
   * @returns Number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size
  }

  /**
   * Destroy the session store and clear all sessions
   */
  destroy(): void {
    clearInterval(this.cleanupInterval)

    // Clear all sessions
    for (const id of this.sessions.keys()) {
      this.deleteSession(id)
    }

    this.sessions.clear()
    logger.info('Session store destroyed')
  }
}
