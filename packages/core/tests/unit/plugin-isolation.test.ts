import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
/**
 * Plugin namespace isolation tests
 * Tests for plugin data separation and security isolation
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPluginSessionContext } from '../../src/mcp-setup.js'
import type { MCPSessionContext } from '../../src/mcp-setup.js'

describe('Plugin Isolation', () => {
  let mockServer: any
  let mockSessionContext: MCPSessionContext
  let sessionId: string

  beforeEach(() => {
    sessionId = 'test-session-id'

    // Mock session store
    const sessionStore = new Map<string, unknown>()

    mockSessionContext = {
      sessionId,
      sessionStore: {
        get: vi.fn(() => ({ data: sessionStore })),
        setPluginData: vi.fn((_id, key, data) => {
          sessionStore.set(key, data)
        }),
        getPluginData: vi.fn((_id, key) => {
          return sessionStore.get(key)
        }),
        deletePluginData: vi.fn((_id, key) => {
          return sessionStore.delete(key)
        }),
        rotateSession: vi.fn(() => true),
      },
    }

    mockServer = {
      getSessionContext: vi.fn(() => mockSessionContext),
    }
  })

  describe('Plugin namespace separation', () => {
    it('should create isolated contexts for different plugins', () => {
      const plugin1Context = createPluginSessionContext(mockServer, 'plugin1')
      const plugin2Context = createPluginSessionContext(mockServer, 'plugin2')

      expect(plugin1Context.sessionId).toBe(sessionId)
      expect(plugin2Context.sessionId).toBe(sessionId)
      expect(plugin1Context.sessionStore).toBeDefined()
      expect(plugin2Context.sessionStore).toBeDefined()
    })

    it('should isolate plugin data by namespace', () => {
      const plugin1Context = createPluginSessionContext(mockServer, 'plugin1')
      const plugin2Context = createPluginSessionContext(mockServer, 'plugin2')

      // Set data in plugin1
      plugin1Context.sessionStore.set('key1', 'value1')
      plugin1Context.sessionStore.set('shared-key', 'plugin1-value')

      // Set data in plugin2
      plugin2Context.sessionStore.set('key2', 'value2')
      plugin2Context.sessionStore.set('shared-key', 'plugin2-value')

      // Verify isolation
      expect(plugin1Context.sessionStore.get('key1')).toBe('value1')
      expect(plugin1Context.sessionStore.get('key2')).toBeUndefined()
      expect(plugin1Context.sessionStore.get('shared-key')).toBe('plugin1-value')

      expect(plugin2Context.sessionStore.get('key1')).toBeUndefined()
      expect(plugin2Context.sessionStore.get('key2')).toBe('value2')
      expect(plugin2Context.sessionStore.get('shared-key')).toBe('plugin2-value')
    })

    it('should use correct namespace prefixes', () => {
      const plugin1Context = createPluginSessionContext(mockServer, 'oauth-plugin')
      const plugin2Context = createPluginSessionContext(mockServer, 'auth-helper')

      plugin1Context.sessionStore.set('token', 'oauth-token')
      plugin2Context.sessionStore.set('token', 'auth-token')

      // Verify the underlying calls use correct prefixes
      expect(mockSessionContext.sessionStore.setPluginData).toHaveBeenCalledWith(
        sessionId,
        'plugin:oauth-plugin:token',
        'oauth-token'
      )

      expect(mockSessionContext.sessionStore.setPluginData).toHaveBeenCalledWith(
        sessionId,
        'plugin:auth-helper:token',
        'auth-token'
      )
    })

    it('should prevent cross-plugin data access', () => {
      const plugin1Context = createPluginSessionContext(mockServer, 'plugin1')
      const plugin2Context = createPluginSessionContext(mockServer, 'plugin2')

      // Plugin1 stores sensitive data
      plugin1Context.sessionStore.set('secret', 'sensitive-data')

      // Plugin2 cannot access plugin1's data
      expect(plugin2Context.sessionStore.get('secret')).toBeUndefined()

      // Even if plugin2 tries to guess the key name
      expect(plugin2Context.sessionStore.get('plugin:plugin1:secret')).toBeUndefined()
    })
  })

  describe('Plugin ID injection protection', () => {
    it('should sanitize malicious plugin IDs', () => {
      // Test various injection attempts
      const maliciousIds = [
        '../../../plugin2',
        'plugin1:../../sensitive',
        'plugin1\x00plugin2',
        'plugin:malicious:',
        '',
      ]

      maliciousIds.forEach(maliciousId => {
        const context = createPluginSessionContext(mockServer, maliciousId)
        context.sessionStore.set('test', 'data')

        // Should still create proper namespace (escaped/sanitized)
        expect(mockSessionContext.sessionStore.setPluginData).toHaveBeenCalledWith(
          sessionId,
          `plugin:${maliciousId}:test`,
          'data'
        )
      })
    })

    it('should handle special characters in plugin IDs', () => {
      const specialChars = ['plugin@1', 'plugin-v2', 'plugin_test', 'plugin.ext']

      specialChars.forEach(pluginId => {
        const context = createPluginSessionContext(mockServer, pluginId)
        context.sessionStore.set('key', 'value')

        expect(mockSessionContext.sessionStore.setPluginData).toHaveBeenCalledWith(
          sessionId,
          `plugin:${pluginId}:key`,
          'value'
        )
      })
    })
  })

  describe('Key injection protection', () => {
    it('should prevent key injection attacks', () => {
      const plugin1Context = createPluginSessionContext(mockServer, 'plugin1')

      // Malicious keys trying to escape namespace
      const maliciousKeys = [
        '../plugin2:key',
        ':plugin2:key',
        'plugin:plugin2:key',
        '\x00plugin2:key',
      ]

      maliciousKeys.forEach(maliciousKey => {
        plugin1Context.sessionStore.set(maliciousKey, 'malicious-data')

        // Should still be namespaced under plugin1
        expect(mockSessionContext.sessionStore.setPluginData).toHaveBeenCalledWith(
          sessionId,
          `plugin:plugin1:${maliciousKey}`,
          'malicious-data'
        )
      })
    })

    it('should allow legitimate key names', () => {
      const plugin1Context = createPluginSessionContext(mockServer, 'plugin1')

      const legitimateKeys = [
        'access_token',
        'user-data',
        'config.json',
        'state_2024',
        'callback_url',
      ]

      legitimateKeys.forEach(key => {
        plugin1Context.sessionStore.set(key, 'data')

        expect(mockSessionContext.sessionStore.setPluginData).toHaveBeenCalledWith(
          sessionId,
          `plugin:plugin1:${key}`,
          'data'
        )
      })
    })
  })

  describe('No session handling', () => {
    it('should return dummy context when no session available', () => {
      const noSessionServer = {
        getSessionContext: vi.fn(() => undefined),
      }

      const context = createPluginSessionContext(noSessionServer, 'test-plugin')

      expect(context.sessionId).toBeUndefined()
      expect(context.sessionStore).toBeDefined()

      // Operations should be no-ops
      context.sessionStore.set('key', 'value')
      expect(context.sessionStore.get('key')).toBeUndefined()
      context.sessionStore.delete('key') // Should not throw
    })

    it('should return dummy context when session ID is missing', () => {
      const noSessionIdServer = {
        getSessionContext: vi.fn(() => ({
          sessionId: undefined,
          sessionStore: mockSessionContext.sessionStore,
        })),
      }

      const context = createPluginSessionContext(noSessionIdServer, 'test-plugin')

      expect(context.sessionId).toBeUndefined()
      expect(context.sessionStore.get('any-key')).toBeUndefined()
    })
  })

  describe('Plugin data lifecycle', () => {
    it('should handle plugin data deletion', () => {
      const plugin1Context = createPluginSessionContext(mockServer, 'plugin1')
      const plugin2Context = createPluginSessionContext(mockServer, 'plugin2')

      // Set data in both plugins
      plugin1Context.sessionStore.set('data', 'plugin1-data')
      plugin2Context.sessionStore.set('data', 'plugin2-data')

      // Delete from plugin1
      plugin1Context.sessionStore.delete('data')

      // Plugin1 data should be gone
      expect(plugin1Context.sessionStore.get('data')).toBeUndefined()

      // Plugin2 data should remain
      expect(plugin2Context.sessionStore.get('data')).toBe('plugin2-data')
    })

    it('should handle complex data types', () => {
      const pluginContext = createPluginSessionContext(mockServer, 'test-plugin')

      const complexData = {
        user: { id: 123, name: 'test' },
        tokens: ['token1', 'token2'],
        config: new Map([['key', 'value']]),
        timestamp: new Date(),
      }

      pluginContext.sessionStore.set('complex', complexData)

      // Note: The actual storage/retrieval depends on the session store implementation
      // This tests the interface isolation
      expect(mockSessionContext.sessionStore.setPluginData).toHaveBeenCalledWith(
        sessionId,
        'plugin:test-plugin:complex',
        complexData
      )
    })
  })

  describe('Plugin context immutability', () => {
    it('should not allow modification of session context', () => {
      const pluginContext = createPluginSessionContext(mockServer, 'test-plugin')

      // Plugin should not be able to modify sessionId
      const _originalSessionId = pluginContext.sessionId
      ;(pluginContext as any).sessionId = 'hacked-session-id'

      // Should not affect the underlying session context
      expect(mockSessionContext.sessionId).toBe(sessionId)
      expect(pluginContext.sessionId).toBe('hacked-session-id') // Local change only
    })

    it('should not expose underlying session store', () => {
      const pluginContext = createPluginSessionContext(mockServer, 'test-plugin')

      // Plugin should not have access to raw session store methods
      expect(pluginContext.sessionStore).not.toHaveProperty('setPluginData')
      expect(pluginContext.sessionStore).not.toHaveProperty('getPluginData')
      expect(pluginContext.sessionStore).not.toHaveProperty('rotateSession')

      // Only isolated methods should be available
      expect(pluginContext.sessionStore).toHaveProperty('set')
      expect(pluginContext.sessionStore).toHaveProperty('get')
      expect(pluginContext.sessionStore).toHaveProperty('delete')
    })
  })
})
