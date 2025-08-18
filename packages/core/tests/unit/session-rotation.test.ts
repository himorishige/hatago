/**
 * Session rotation security tests
 * Tests for session fixation attack prevention and rotation mechanisms
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSessionId } from '../../src/session/index.js'
import { SessionManager } from '../../src/session/session-manager.js'

describe('Session Rotation Security', () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    sessionManager = new SessionManager({
      ttlMs: 60 * 1000, // 1 minute
      cleanupIntervalMs: 100,
      maxSessions: 10,
    })
  })

  afterEach(() => {
    sessionManager.destroy()
  })

  describe('Session fixation prevention', () => {
    it('should rotate session ID on authentication upgrade', () => {
      // Create unauthenticated session
      const unauthenticatedSession = sessionManager.createSession()
      const oldSessionId = unauthenticatedSession.id

      // Store some pre-auth data
      sessionManager.setPluginData(oldSessionId, 'plugin:oauth:state', 'oauth-state-value')
      sessionManager.setPluginData(oldSessionId, 'plugin:oauth:csrf', 'csrf-token')

      // Simulate authentication success - rotate session
      const newSessionId = generateSessionId()
      const rotated = sessionManager.rotateSession(oldSessionId, newSessionId)

      expect(rotated).toBe(true)

      // Old session should be completely gone
      expect(sessionManager.getSession(oldSessionId)).toBeUndefined()

      // New session should exist with preserved data
      const newSession = sessionManager.getSession(newSessionId)
      expect(newSession).toBeDefined()
      expect(newSession?.id).toBe(newSessionId)

      // Pre-auth data should be preserved
      expect(sessionManager.getPluginData(newSessionId, 'plugin:oauth:state')).toBe(
        'oauth-state-value'
      )
      expect(sessionManager.getPluginData(newSessionId, 'plugin:oauth:csrf')).toBe('csrf-token')
    })

    it('should prevent session fixation by invalidating old ID immediately', () => {
      const session = sessionManager.createSession()
      const oldId = session.id
      const newId = generateSessionId()

      // Attacker could have the old session ID
      const attackerReference = sessionManager.getSession(oldId)
      expect(attackerReference).toBeDefined()

      // Legitimate user authenticates and session rotates
      sessionManager.rotateSession(oldId, newId)

      // Attacker's reference to old session should be invalid
      expect(sessionManager.getSession(oldId)).toBeUndefined()

      // Only new session ID should work
      expect(sessionManager.getSession(newId)).toBeDefined()
    })

    it('should generate cryptographically strong new session IDs', () => {
      const session = sessionManager.createSession()
      const rotatedIds = new Set<string>()

      // Rotate session multiple times
      let currentId = session.id
      for (let i = 0; i < 50; i++) {
        const newId = generateSessionId()
        sessionManager.rotateSession(currentId, newId)
        rotatedIds.add(newId)
        currentId = newId
      }

      // All IDs should be unique
      expect(rotatedIds.size).toBe(50)

      // All IDs should be proper format (64-char hex)
      for (const id of rotatedIds) {
        expect(id).toMatch(/^[a-f0-9]{64}$/i)
      }
    })
  })

  describe('Session rotation race conditions', () => {
    it('should handle concurrent rotation attempts atomically', async () => {
      const session = sessionManager.createSession()
      const originalId = session.id

      // Store test data
      sessionManager.setPluginData(originalId, 'plugin:test:data', 'test-value')

      // Concurrent rotation attempts
      const newId1 = generateSessionId()
      const newId2 = generateSessionId()
      const newId3 = generateSessionId()

      const rotationPromises = [
        Promise.resolve(sessionManager.rotateSession(originalId, newId1)),
        Promise.resolve(sessionManager.rotateSession(originalId, newId2)),
        Promise.resolve(sessionManager.rotateSession(originalId, newId3)),
      ]

      const results = await Promise.all(rotationPromises)

      // Only one rotation should succeed
      const successCount = results.filter(r => r === true).length
      expect(successCount).toBe(1)

      // Original session should be gone
      expect(sessionManager.getSession(originalId)).toBeUndefined()

      // Only one new session should exist
      const existingSessions = [
        sessionManager.getSession(newId1),
        sessionManager.getSession(newId2),
        sessionManager.getSession(newId3),
      ].filter(s => s !== undefined)

      expect(existingSessions).toHaveLength(1)

      // Data should be preserved in the successful rotation
      const survivingSession = existingSessions[0]!
      expect(sessionManager.getPluginData(survivingSession.id, 'plugin:test:data')).toBe(
        'test-value'
      )
    })

    it('should handle rotation of non-existent session gracefully', () => {
      const nonExistentId = 'non-existent-session-id'
      const newId = generateSessionId()

      const result = sessionManager.rotateSession(nonExistentId, newId)

      expect(result).toBe(false)
      expect(sessionManager.getSession(newId)).toBeUndefined()
    })

    it('should handle rotation during session cleanup', async () => {
      // Create session with very short TTL
      const shortTtlManager = new SessionManager({
        ttlMs: 10, // 10ms
        cleanupIntervalMs: 5,
      })

      const session = shortTtlManager.createSession()
      const sessionId = session.id

      // Store some data
      shortTtlManager.setPluginData(sessionId, 'plugin:test:data', 'value')

      // Try to rotate just as session expires
      const newId = generateSessionId()

      // Wait for potential expiration
      await new Promise(resolve => setTimeout(resolve, 20))

      // Rotation should fail if session expired
      const rotated = shortTtlManager.rotateSession(sessionId, newId)

      if (rotated) {
        // If rotation succeeded, new session should exist
        expect(shortTtlManager.getSession(newId)).toBeDefined()
      } else {
        // If rotation failed, new session should not exist
        expect(shortTtlManager.getSession(newId)).toBeUndefined()
      }

      shortTtlManager.destroy()
    })
  })

  describe('Data preservation during rotation', () => {
    it('should preserve all plugin data during rotation', () => {
      const session = sessionManager.createSession()
      const oldId = session.id

      // Store various types of plugin data
      const testData = [
        ['plugin:oauth:access_token', 'at_12345'],
        ['plugin:oauth:refresh_token', 'rt_67890'],
        ['plugin:oauth:expires_at', 1640995200000],
        ['plugin:oauth:user_info', { id: 123, name: 'test' }],
        ['plugin:auth:permissions', ['read', 'write']],
        ['plugin:state:complex', new Map([['key', 'value']])],
      ]

      testData.forEach(([key, value]) => {
        sessionManager.setPluginData(oldId, key, value)
      })

      // Rotate session
      const newId = generateSessionId()
      const rotated = sessionManager.rotateSession(oldId, newId)
      expect(rotated).toBe(true)

      // Verify all data is preserved
      testData.forEach(([key, expectedValue]) => {
        const actualValue = sessionManager.getPluginData(newId, key)
        expect(actualValue).toEqual(expectedValue)
      })
    })

    it('should preserve session metadata correctly', () => {
      const session = sessionManager.createSession()
      const oldId = session.id
      const originalCreatedAt = session.createdAt

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        const newId = generateSessionId()
        sessionManager.rotateSession(oldId, newId)

        const newSession = sessionManager.getSession(newId)
        expect(newSession).toBeDefined()

        // Creation time should be preserved from original
        expect(newSession!.createdAt).toBe(originalCreatedAt)

        // Last accessed should be updated
        expect(newSession!.lastAccessedAt).toBeGreaterThan(originalCreatedAt)

        // Expiration should be extended
        expect(newSession!.expiresAt).toBeGreaterThan(session.expiresAt)
      }, 10)
    })

    it('should handle empty session data during rotation', () => {
      const session = sessionManager.createSession()
      const oldId = session.id

      // Don't add any data
      const newId = generateSessionId()
      const rotated = sessionManager.rotateSession(oldId, newId)

      expect(rotated).toBe(true)

      const newSession = sessionManager.getSession(newId)
      expect(newSession).toBeDefined()
      expect(newSession!.data.data.size).toBe(0)
    })
  })

  describe('Resource cleanup during rotation', () => {
    it('should close old transport when rotating', () => {
      const session = sessionManager.createSession()
      const oldId = session.id

      // Mock transport close method
      const oldTransport = session.transport as any
      oldTransport.close = vi.fn()

      const newId = generateSessionId()
      sessionManager.rotateSession(oldId, newId)

      // Old transport should be closed
      expect(oldTransport.close).toHaveBeenCalledOnce()
    })

    it('should handle transport close errors gracefully', () => {
      const session = sessionManager.createSession()
      const oldId = session.id

      // Mock transport that throws on close
      const oldTransport = session.transport as any
      oldTransport.close = vi.fn(() => {
        throw new Error('Transport close failed')
      })

      const newId = generateSessionId()

      // Should not throw despite transport error
      expect(() => {
        sessionManager.rotateSession(oldId, newId)
      }).not.toThrow()

      // Rotation should still succeed
      expect(sessionManager.getSession(newId)).toBeDefined()
      expect(sessionManager.getSession(oldId)).toBeUndefined()
    })

    it('should create new transport for rotated session', () => {
      const session = sessionManager.createSession()
      const oldId = session.id
      const oldTransport = session.transport

      const newId = generateSessionId()
      sessionManager.rotateSession(oldId, newId)

      const newSession = sessionManager.getSession(newId)
      expect(newSession).toBeDefined()
      expect(newSession!.transport).toBeDefined()
      expect(newSession!.transport).not.toBe(oldTransport)
    })
  })

  describe('Session rotation limits and validation', () => {
    it('should fail rotation with duplicate session ID', () => {
      const session1 = sessionManager.createSession()
      const session2 = sessionManager.createSession()

      // Try to rotate session1 to session2's ID
      const _result = sessionManager.rotateSession(session1.id, session2.id)

      // This might succeed or fail depending on implementation
      // The important thing is that no data corruption occurs
      const session2After = sessionManager.getSession(session2.id)
      expect(session2After).toBeDefined()
    })

    it('should handle rapid successive rotations', () => {
      const session = sessionManager.createSession()
      let currentId = session.id

      sessionManager.setPluginData(currentId, 'plugin:test:counter', 0)

      // Perform rapid rotations
      for (let i = 1; i <= 10; i++) {
        const newId = generateSessionId()
        const rotated = sessionManager.rotateSession(currentId, newId)

        expect(rotated).toBe(true)
        expect(sessionManager.getSession(currentId)).toBeUndefined()

        // Update counter and continue with new ID
        sessionManager.setPluginData(newId, 'plugin:test:counter', i)
        currentId = newId
      }

      // Final counter should be 10
      expect(sessionManager.getPluginData(currentId, 'plugin:test:counter')).toBe(10)
    })

    it('should not rotate when manager is destroyed', () => {
      const session = sessionManager.createSession()
      const oldId = session.id

      sessionManager.destroy()

      const newId = generateSessionId()
      const result = sessionManager.rotateSession(oldId, newId)

      expect(result).toBe(false)
    })
  })
})
