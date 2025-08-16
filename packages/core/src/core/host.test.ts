/**
 * Tests for functional plugin host implementation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, test } from 'vitest'
import type { CapabilityAwarePlugin, PluginManifest } from '../types.js'
import {
  completeLoading,
  createCapabilityRegistry,
  createHost,
  getAllLoadedPlugins,
  getCapabilities,
  getLoadedPlugin,
  handleLoadingError,
  hasCapability,
  resetHost,
  startLoading,
  stopHost,
  validateCapabilities,
  validateManifest,
} from './host.js'

// Mock server for testing
const mockServer = {} as McpServer

// Mock plugin manifest
const mockManifest: PluginManifest = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'Test plugin',
  engines: {
    hatago: '^0.1.0',
  },
  capabilities: ['logger', 'fetch'],
  entry: {
    default: './plugin.js',
  },
}

// Mock plugin
const mockPlugin: CapabilityAwarePlugin = async () => {
  // Mock implementation
}

describe('Host Core Functions', () => {
  test('createHost creates initial state correctly', () => {
    const host = createHost(mockServer, 'node')

    expect(host.state).toBe('idle')
    expect(host.runtime).toBe('node')
    expect(host.server).toBe(mockServer)
    expect(host.loadedPlugins.size).toBe(0)
    expect(host.error).toBeNull()

    // Check node runtime capabilities
    expect(host.availableCapabilities.has('logger')).toBe(true)
    expect(host.availableCapabilities.has('fetch')).toBe(true)
    expect(host.availableCapabilities.has('kv')).toBe(true)
    expect(host.availableCapabilities.has('timer')).toBe(true)
    expect(host.availableCapabilities.has('crypto')).toBe(true)
  })

  test('createHost for workers runtime has correct capabilities', () => {
    const host = createHost(mockServer, 'workers')

    expect(host.runtime).toBe('workers')
    expect(host.availableCapabilities.has('logger')).toBe(true)
    expect(host.availableCapabilities.has('fetch')).toBe(true)
    expect(host.availableCapabilities.has('kv')).toBe(true)
    expect(host.availableCapabilities.has('crypto')).toBe(true)
    // Timer not available in workers
    expect(host.availableCapabilities.has('timer')).toBe(false)
  })

  test('startLoading transitions from idle to loading', () => {
    const host = createHost(mockServer, 'node')
    const result = startLoading(host, mockManifest)

    expect(result.state.state).toBe('loading')
    expect(result.effects).toHaveLength(2)
    expect(result.effects[0]?.type).toBe('loadPlugin')
    expect(result.effects[1]?.type).toBe('log')
  })

  test('startLoading fails when not in idle state', () => {
    const host = createHost(mockServer, 'node')
    const loadingHost = { ...host, state: 'loading' as const }
    const result = startLoading(loadingHost, mockManifest)

    expect(result.state.state).toBe('error')
    expect(result.state.error).toBe('Host not in idle state')
    expect(result.effects[0]?.type).toBe('error')
  })

  test('completeLoading transitions from loading to running', () => {
    const host = createHost(mockServer, 'node')
    const loadingHost = { ...host, state: 'loading' as const }
    const result = completeLoading(loadingHost, mockManifest, mockPlugin)

    expect(result.state.state).toBe('running')
    expect(result.state.loadedPlugins.has('test-plugin')).toBe(true)
    expect(result.state.error).toBeNull()
    expect(result.effects[0]?.type).toBe('log')
  })

  test('completeLoading fails when not in loading state', () => {
    const host = createHost(mockServer, 'node')
    const result = completeLoading(host, mockManifest, mockPlugin)

    expect(result.state.state).toBe('error')
    expect(result.state.error).toBe('Host not in loading state')
  })

  test('handleLoadingError sets error state', () => {
    const host = createHost(mockServer, 'node')
    const errorMessage = 'Plugin loading failed'
    const result = handleLoadingError(host, errorMessage)

    expect(result.state.state).toBe('error')
    expect(result.state.error).toBe(errorMessage)
    expect(result.effects[0]?.type).toBe('error')
  })

  test('stopHost transitions to stopped state', () => {
    const host = createHost(mockServer, 'node')
    const runningHost = { ...host, state: 'running' as const }
    const result = stopHost(runningHost)

    expect(result.state.state).toBe('stopped')
    expect(result.effects[0]?.type).toBe('log')
  })

  test('stopHost does nothing when already stopped', () => {
    const host = createHost(mockServer, 'node')
    const stoppedHost = { ...host, state: 'stopped' as const }
    const result = stopHost(stoppedHost)

    expect(result.state.state).toBe('stopped')
    expect(result.effects).toHaveLength(0)
  })

  test('resetHost transitions to idle state', () => {
    const host = createHost(mockServer, 'node')
    const errorHost = { ...host, state: 'error' as const, error: 'Some error' }
    const result = resetHost(errorHost)

    expect(result.state.state).toBe('idle')
    expect(result.state.error).toBeNull()
    expect(result.effects[0]?.type).toBe('log')
  })

  test('getLoadedPlugin returns correct plugin', () => {
    const host = createHost(mockServer, 'node')
    const loadedPlugins = new Map([
      [
        'test-plugin',
        {
          manifest: mockManifest,
          plugin: mockPlugin,
          loadedAt: Date.now(),
        },
      ],
    ])
    const hostWithPlugin = { ...host, loadedPlugins }

    const plugin = getLoadedPlugin(hostWithPlugin, 'test-plugin')
    expect(plugin).toBeDefined()
    expect(plugin?.manifest.name).toBe('test-plugin')

    const nonExistent = getLoadedPlugin(hostWithPlugin, 'non-existent')
    expect(nonExistent).toBeUndefined()
  })

  test('getAllLoadedPlugins returns all plugins', () => {
    const host = createHost(mockServer, 'node')
    const loadedPlugins = new Map([
      [
        'plugin1',
        {
          manifest: { ...mockManifest, name: 'plugin1' },
          plugin: mockPlugin,
          loadedAt: Date.now(),
        },
      ],
      [
        'plugin2',
        {
          manifest: { ...mockManifest, name: 'plugin2' },
          plugin: mockPlugin,
          loadedAt: Date.now(),
        },
      ],
    ])
    const hostWithPlugins = { ...host, loadedPlugins }

    const plugins = getAllLoadedPlugins(hostWithPlugins)
    expect(plugins).toHaveLength(2)
    expect(plugins[0]?.manifest.name).toBe('plugin1')
    expect(plugins[1]?.manifest.name).toBe('plugin2')
  })

  test('hasCapability and getCapabilities work correctly', () => {
    const host = createHost(mockServer, 'node')

    expect(hasCapability(host, 'logger')).toBe(true)
    expect(hasCapability(host, 'fetch')).toBe(true)
    expect(hasCapability(host, 'nonexistent')).toBe(false)

    const capabilities = getCapabilities(host)
    expect(capabilities).toContain('logger')
    expect(capabilities).toContain('fetch')
    expect(capabilities).toContain('kv')
    expect(capabilities).toContain('timer')
    expect(capabilities).toContain('crypto')
  })
})

describe('Validation Functions', () => {
  test('validateManifest passes with valid manifest', () => {
    const result = validateManifest(mockManifest)
    expect(result.valid).toBe(true)
  })

  test('validateManifest fails with missing name', () => {
    const invalidManifest = { ...mockManifest, name: '' }
    const result = validateManifest(invalidManifest)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('missing required fields')
    }
  })

  test('validateManifest fails with missing engines.hatago', () => {
    const invalidManifest = { ...mockManifest, engines: {} }
    // @ts-expect-error - Testing invalid manifest structure
    const result = validateManifest(invalidManifest)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('missing engines.hatago')
    }
  })

  test('validateManifest fails with invalid capabilities', () => {
    const invalidManifest = { ...mockManifest, capabilities: 'not-an-array' as unknown as string[] }
    const result = validateManifest(invalidManifest)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('capabilities must be an array')
    }
  })

  test('validateManifest fails with missing entry.default', () => {
    const invalidManifest = { ...mockManifest, entry: {} as unknown as PluginManifest['entry'] }
    const result = validateManifest(invalidManifest)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('missing entry.default')
    }
  })

  test('validateCapabilities passes with available capabilities', () => {
    const host = createHost(mockServer, 'node')
    const result = validateCapabilities(host, mockManifest)
    expect(result.valid).toBe(true)
  })

  test('validateCapabilities fails with unavailable capability', () => {
    const host = createHost(mockServer, 'workers') // workers doesn't have timer
    const manifestWithTimer = {
      ...mockManifest,
      capabilities: ['logger', 'timer'],
    }
    const result = validateCapabilities(host, manifestWithTimer)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('unavailable capability: timer')
    }
  })
})

describe('Capability Registry Creation', () => {
  test('createCapabilityRegistry creates registry with requested capabilities', () => {
    const host = createHost(mockServer, 'node')
    const registry = createCapabilityRegistry(host, mockManifest)

    expect(registry.logger).toBeDefined()
    expect(registry.fetch).toBeDefined()
    expect(registry.kv).toBeUndefined() // not requested in mockManifest
  })

  test('createCapabilityRegistry respects runtime limitations', () => {
    const host = createHost(mockServer, 'workers')
    const manifestWithTimer = {
      ...mockManifest,
      capabilities: ['logger', 'timer'],
    }
    const registry = createCapabilityRegistry(host, manifestWithTimer)

    expect(registry.logger).toBeDefined()
    expect(registry.timer).toBeUndefined() // not available in workers
  })
})
