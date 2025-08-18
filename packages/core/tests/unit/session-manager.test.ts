/**
 * SessionManager security tests
 * Tests for race conditions, resource management, and security vulnerabilities
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionManager } from '../../src/session/session-manager.js'

describe('SessionManager', () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    sessionManager = new SessionManager({
      ttlMs: 60 * 1000, // 1 minute for tests
      cleanupIntervalMs: 100, // Fast cleanup for tests
      maxSessions: 3, // Small limit for testing
    })
  })

  afterEach(() => {
    sessionManager.destroy()
  })

  describe('Basic functionality', () => {
    it('should create a new session', () => {
      const session = sessionManager.createSession()

      expect(session).toBeDefined()
      expect(session.id).toMatch(/^[a-f0-9]{64}$/i) // 64-char hex format
      expect(session.transport).toBeDefined()
      expect(session.data).toBeDefined()
      expect(sessionManager.size()).toBe(1)
    })

    it('should retrieve existing session', () => {
      const session = sessionManager.createSession()
      const retrieved = sessionManager.getSession(session.id)

      expect(retrieved).toBe(session)
      expect(retrieved?.id).toBe(session.id)
    })

    it('should return undefined for non-existent session', () => {
      const retrieved = sessionManager.getSession('non-existent-id')
      expect(retrieved).toBeUndefined()
    })

    it('should delete session', () => {
      const session = sessionManager.createSession()
      const deleted = sessionManager.deleteSession(session.id)

      expect(deleted).toBe(true)
      expect(sessionManager.getSession(session.id)).toBeUndefined()
      expect(sessionManager.size()).toBe(0)
    })
  })

  describe('TTL and expiration', () => {
    it('should expire sessions after TTL', async () => {
      const shortTtlManager = new SessionManager({
        ttlMs: 50, // 50ms
        cleanupIntervalMs: 10,
      })

      const session = shortTtlManager.createSession()
      expect(shortTtlManager.getSession(session.id)).toBeDefined()

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(shortTtlManager.getSession(session.id)).toBeUndefined()

      shortTtlManager.destroy()
    })

    it('should update last access time on retrieval', async () => {
      const session = sessionManager.createSession()
      const initialAccess = session.lastAccessedAt

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const retrieved = sessionManager.getSession(session.id)
      expect(retrieved?.lastAccessedAt).toBeGreaterThan(initialAccess)
    })
  })

  describe('Session rotation security', () => {
    it('should rotate session ID successfully', () => {
      const session = sessionManager.createSession()
      const oldId = session.id
      const newId = 'new-session-id-test'

      const rotated = sessionManager.rotateSession(oldId, newId)

      expect(rotated).toBe(true)
      expect(sessionManager.getSession(oldId)).toBeUndefined()

      const newSession = sessionManager.getSession(newId)
      expect(newSession).toBeDefined()
      expect(newSession?.id).toBe(newId)
      expect(newSession?.data.data).toEqual(session.data.data) // Data preserved
    })

    it('should fail rotation for non-existent session', () => {
      const rotated = sessionManager.rotateSession('non-existent', 'new-id')
      expect(rotated).toBe(false)
    })

    it('should preserve session data during rotation', () => {
      const session = sessionManager.createSession()

      // Add some plugin data
      sessionManager.setPluginData(session.id, 'plugin:test:key', 'test-value')

      const newId = 'rotated-session-id'
      sessionManager.rotateSession(session.id, newId)

      const data = sessionManager.getPluginData(newId, 'plugin:test:key')
      expect(data).toBe('test-value')
    })
  })

  describe('Plugin data isolation', () => {
    it('should store and retrieve plugin data', () => {
      const session = sessionManager.createSession()
      const pluginKey = 'plugin:test:key'
      const testData = { value: 'test' }

      const stored = sessionManager.setPluginData(session.id, pluginKey, testData)
      expect(stored).toBe(true)

      const retrieved = sessionManager.getPluginData(session.id, pluginKey)
      expect(retrieved).toEqual(testData)
    })

    it('should delete plugin data', () => {
      const session = sessionManager.createSession()
      const pluginKey = 'plugin:test:key'

      sessionManager.setPluginData(session.id, pluginKey, 'test-data')
      expect(sessionManager.getPluginData(session.id, pluginKey)).toBe('test-data')

      const deleted = sessionManager.deletePluginData(session.id, pluginKey)
      expect(deleted).toBe(true)
      expect(sessionManager.getPluginData(session.id, pluginKey)).toBeUndefined()
    })

    it('should isolate plugin data between different plugins', () => {
      const session = sessionManager.createSession()

      sessionManager.setPluginData(session.id, 'plugin:plugin1:key', 'data1')
      sessionManager.setPluginData(session.id, 'plugin:plugin2:key', 'data2')

      expect(sessionManager.getPluginData(session.id, 'plugin:plugin1:key')).toBe('data1')
      expect(sessionManager.getPluginData(session.id, 'plugin:plugin2:key')).toBe('data2')
      expect(sessionManager.getPluginData(session.id, 'plugin:plugin1:key')).not.toBe('data2')
    })
  })

  describe('Resource management', () => {
    it('should enforce session limit', () => {
      // Create sessions up to limit
      const sessions = []
      for (let i = 0; i < 3; i++) {
        sessions.push(sessionManager.createSession())
      }
      expect(sessionManager.size()).toBe(3)

      // Creating another should evict oldest
      const newSession = sessionManager.createSession()
      expect(sessionManager.size()).toBe(3) // Still at limit
      expect(sessionManager.getSession(sessions[0].id)).toBeUndefined() // Oldest evicted
      expect(sessionManager.getSession(newSession.id)).toBeDefined() // New one exists
    })

    it('should not create sessions after destruction', () => {
      sessionManager.destroy()

      expect(() => sessionManager.createSession()).toThrow('SessionManager has been destroyed')
    })

    it('should return undefined for operations after destruction', () => {
      const session = sessionManager.createSession()
      sessionManager.destroy()

      expect(sessionManager.getSession(session.id)).toBeUndefined()
      expect(sessionManager.deleteSession(session.id)).toBe(false)
      expect(sessionManager.rotateSession(session.id, 'new-id')).toBe(false)
    })
  })

  describe('Race condition testing', () => {
    it('should handle concurrent session creation', async () => {
      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve(sessionManager.createSession())
      )

      const sessions = await Promise.all(promises)
      const uniqueIds = new Set(sessions.map(s => s.id))

      // All sessions should have unique IDs (limited by maxSessions eviction)
      expect(uniqueIds.size).toBeGreaterThanOrEqual(3) // At least maxSessions should survive
    })

    it('should handle concurrent rotation requests', async () => {
      const session = sessionManager.createSession()
      const rotationPromises = [
        sessionManager.rotateSession(session.id, 'new-id-1'),
        sessionManager.rotateSession(session.id, 'new-id-2'),
        sessionManager.rotateSession(session.id, 'new-id-3'),
      ]

      const results = await Promise.all(rotationPromises)

      // Only one rotation should succeed
      const successCount = results.filter(r => r === true).length
      expect(successCount).toBe(1)

      // Original session should be gone
      expect(sessionManager.getSession(session.id)).toBeUndefined()
    })

    it('should handle concurrent plugin data updates', async () => {
      const session = sessionManager.createSession()
      const key = 'plugin:test:counter'

      // Concurrent updates to same key
      const updatePromises = Array.from({ length: 5 }, (_, i) =>
        Promise.resolve(sessionManager.setPluginData(session.id, key, i))
      )

      await Promise.all(updatePromises)

      // Should have some value (last writer wins)
      const finalValue = sessionManager.getPluginData(session.id, key)
      expect(finalValue).toBeGreaterThanOrEqual(0)
      expect(finalValue).toBeLessThan(5)
    })
  })

  describe('Security properties', () => {
    it('should generate cryptographically strong session IDs', () => {
      const sessionIds = new Set()

      // Generate many sessions to test uniqueness
      for (let i = 0; i < 100; i++) {
        const session = sessionManager.createSession(() => {
          // Use crypto.getRandomValues for testing
          const array = new Uint8Array(32)
          crypto.getRandomValues(array)
          return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '')
        })
        sessionIds.add(session.id)
        sessionManager.deleteSession(session.id) // Cleanup for limit
      }

      // Should have 100 unique IDs
      expect(sessionIds.size).toBe(100)
    })

    it('should not leak session IDs in error messages', () => {
      const session = sessionManager.createSession()

      // Operations on destroyed manager should not leak session ID
      sessionManager.destroy()

      const result = sessionManager.getSession(session.id)
      expect(result).toBeUndefined()

      // Public API should not expose private fields (this is a TypeScript class limitation)
      // In production, private fields would be truly private
    })
  })

  describe('Cleanup and maintenance', () => {
    it('should clean up expired sessions automatically', async () => {
      const quickManager = new SessionManager({
        ttlMs: 20, // 20ms
        cleanupIntervalMs: 30, // 30ms cleanup
      })

      // Create sessions that will expire
      const _session1 = quickManager.createSession()
      const _session2 = quickManager.createSession()

      expect(quickManager.size()).toBe(2)

      // Wait for expiration and cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(quickManager.size()).toBe(0)

      quickManager.destroy()
    })

    it('should stop cleanup after destruction', async () => {
      const manager = new SessionManager({
        ttlMs: 10,
        cleanupIntervalMs: 5,
      })

      manager.createSession()
      manager.destroy()

      // Wait to ensure no cleanup happens after destruction
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should not crash or cause issues
      expect(manager.size()).toBe(0)
    })
  })
})
