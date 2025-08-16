/**
 * Tests for PluginRegistry adapter (backwards compatibility)
 */

import { describe, expect, test } from 'vitest'
import type { HatagoPlugin } from '../types.js'
import { PluginRegistry, PluginRegistryAdapter } from './registry-adapter.js'

// Mock plugins for testing
const mockPlugin1: HatagoPlugin = async () => {
  // Mock implementation
}

const mockPlugin2: HatagoPlugin = async () => {
  // Mock implementation
}

describe('PluginRegistryAdapter', () => {
  test('creates empty registry', () => {
    const registry = new PluginRegistryAdapter()
    expect(registry.size()).toBe(0)
    expect(registry.isEmpty()).toBe(true)
    expect(registry.getAll()).toEqual([])
  })

  test('registers and retrieves plugins', () => {
    const registry = new PluginRegistryAdapter()
    registry.register('test1', mockPlugin1)

    expect(registry.size()).toBe(1)
    expect(registry.has('test1')).toBe(true)
    expect(registry.get('test1')).toBe(mockPlugin1)
    expect(registry.isEmpty()).toBe(false)
  })

  test('unregisters plugins', () => {
    const registry = new PluginRegistryAdapter()
    registry.register('test1', mockPlugin1)
    registry.register('test2', mockPlugin2)

    const result = registry.unregister('test1')

    expect(result).toBe(true)
    expect(registry.size()).toBe(1)
    expect(registry.has('test1')).toBe(false)
    expect(registry.has('test2')).toBe(true)
  })

  test('unregister returns false for non-existent plugin', () => {
    const registry = new PluginRegistryAdapter()
    const result = registry.unregister('nonexistent')

    expect(result).toBe(false)
    expect(registry.size()).toBe(0)
  })

  test('getAll returns all plugins', () => {
    const registry = new PluginRegistryAdapter()
    registry.register('test1', mockPlugin1)
    registry.register('test2', mockPlugin2)

    const plugins = registry.getAll()
    expect(plugins).toHaveLength(2)
    expect(plugins).toContain(mockPlugin1)
    expect(plugins).toContain(mockPlugin2)
  })

  test('getIds returns all plugin IDs', () => {
    const registry = new PluginRegistryAdapter()
    registry.register('test1', mockPlugin1)
    registry.register('test2', mockPlugin2)

    const ids = registry.getIds()
    expect(ids).toHaveLength(2)
    expect(ids).toContain('test1')
    expect(ids).toContain('test2')
  })

  test('clear removes all plugins', () => {
    const registry = new PluginRegistryAdapter()
    registry.register('test1', mockPlugin1)
    registry.register('test2', mockPlugin2)

    registry.clear()

    expect(registry.size()).toBe(0)
    expect(registry.isEmpty()).toBe(true)
    expect(registry.getAll()).toEqual([])
  })

  test('get returns undefined for non-existent plugin', () => {
    const registry = new PluginRegistryAdapter()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  test('has returns false for non-existent plugin', () => {
    const registry = new PluginRegistryAdapter()
    expect(registry.has('nonexistent')).toBe(false)
  })

  test('getSnapshot returns current state', () => {
    const registry = new PluginRegistryAdapter()
    registry.register('test1', mockPlugin1)

    const snapshot = registry.getSnapshot()
    expect(snapshot.plugins.size).toBe(1)
    expect(snapshot.plugins.has('test1')).toBe(true)
  })

  test('applyAll calls all plugins', async () => {
    const calls: string[] = []

    const plugin1: HatagoPlugin = async () => {
      calls.push('plugin1')
    }
    const plugin2: HatagoPlugin = async () => {
      calls.push('plugin2')
    }

    const registry = new PluginRegistryAdapter()
    registry.register('test1', plugin1)
    registry.register('test2', plugin2)

    const mockContext = { server: {}, app: null }
    await registry.applyAll(mockContext)

    expect(calls).toHaveLength(2)
    expect(calls).toContain('plugin1')
    expect(calls).toContain('plugin2')
  })
})

describe('PluginRegistry legacy alias', () => {
  test('PluginRegistry is an alias for PluginRegistryAdapter', () => {
    expect(PluginRegistry).toBe(PluginRegistryAdapter)
  })

  test('works with legacy PluginRegistry name', () => {
    const registry = new PluginRegistry()
    registry.register('test1', mockPlugin1)

    expect(registry.size()).toBe(1)
    expect(registry.has('test1')).toBe(true)
    expect(registry.get('test1')).toBe(mockPlugin1)
  })
})
