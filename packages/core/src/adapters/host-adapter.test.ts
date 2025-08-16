/**
 * Tests for DefaultPluginHostAdapter (backwards compatibility)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, test, vi } from 'vitest'
import type { PluginManifest } from '../types.js'
import { DefaultPluginHost, DefaultPluginHostAdapter } from './host-adapter.js'

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
  capabilities: ['logger'],
  entry: {
    default: './plugin.js',
  },
}

// Mock plugin factory and plugin
const mockPluginFactory = vi.fn().mockReturnValue(vi.fn())

// Mock dynamic import
vi.mock('import', () => ({
  default: () => Promise.resolve({ default: mockPluginFactory }),
}))

describe('DefaultPluginHostAdapter', () => {
  test('creates host with correct initial state', () => {
    const host = new DefaultPluginHostAdapter(mockServer, 'node')

    expect(host.hasCapability('logger')).toBe(true)
    expect(host.hasCapability('fetch')).toBe(true)
    expect(host.getCapabilities()).toContain('logger')
    expect(host.getCapabilities()).toContain('fetch')
  })

  test('creates host for workers runtime', () => {
    const host = new DefaultPluginHostAdapter(mockServer, 'workers')

    expect(host.hasCapability('logger')).toBe(true)
    expect(host.hasCapability('fetch')).toBe(true)
    expect(host.hasCapability('timer')).toBe(false) // Not available in workers
  })

  test('getCapabilities returns available capabilities', () => {
    const host = new DefaultPluginHostAdapter(mockServer, 'node')
    const capabilities = host.getCapabilities()

    expect(capabilities).toContain('logger')
    expect(capabilities).toContain('fetch')
    expect(capabilities).toContain('kv')
    expect(capabilities).toContain('timer')
    expect(capabilities).toContain('crypto')
  })

  test('hasCapability checks capability availability', () => {
    const host = new DefaultPluginHostAdapter(mockServer, 'node')

    expect(host.hasCapability('logger')).toBe(true)
    expect(host.hasCapability('nonexistent')).toBe(false)
  })

  test('loadPlugin fails with invalid manifest', async () => {
    const host = new DefaultPluginHostAdapter(mockServer, 'node')
    const invalidManifest = { ...mockManifest, name: '' }

    await expect(host.loadPlugin(invalidManifest)).rejects.toThrow(
      'Invalid plugin manifest: missing required fields'
    )
  })

  test('loadPlugin fails with unavailable capability', async () => {
    const host = new DefaultPluginHostAdapter(mockServer, 'workers')
    const manifestWithTimer = {
      ...mockManifest,
      capabilities: ['timer'], // Not available in workers
    }

    await expect(host.loadPlugin(manifestWithTimer)).rejects.toThrow(
      'unavailable capability: timer'
    )
  })

  test('stop transitions host to stopped state', () => {
    const host = new DefaultPluginHostAdapter(mockServer, 'node')
    host.stop()

    const state = host.getState()
    expect(state.state).toBe('stopped')
  })

  test('getState returns current host state', () => {
    const host = new DefaultPluginHostAdapter(mockServer, 'node')
    const state = host.getState()

    expect(state.state).toBe('idle')
    expect(state.runtime).toBe('node')
    expect(state.server).toBe(mockServer)
    expect(state.loadedPlugins.size).toBe(0)
    expect(state.error).toBeNull()
  })
})

describe('DefaultPluginHost legacy alias', () => {
  test('DefaultPluginHost is an alias for DefaultPluginHostAdapter', () => {
    expect(DefaultPluginHost).toBe(DefaultPluginHostAdapter)
  })

  test('works with legacy DefaultPluginHost name', () => {
    const host = new DefaultPluginHost(mockServer, 'node')

    expect(host.hasCapability('logger')).toBe(true)
    expect(host.getCapabilities()).toContain('logger')
  })
})
