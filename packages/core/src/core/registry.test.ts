/**
 * Tests for functional plugin registry
 */

import { describe, expect, test } from 'vitest'
import type { HatagoPlugin } from '../types.js'
import {
  addPlugin,
  applyMultiplePlugins,
  clearRegistry,
  createRegistry,
  filterPlugins,
  getAllPlugins,
  getPlugin,
  getPluginCount,
  getPluginIds,
  hasPlugin,
  isEmpty,
  mapPlugins,
  removePlugin,
} from './registry.js'

// Mock plugins for testing
const mockPlugin1: HatagoPlugin = async () => {
  // Mock implementation
}

const mockPlugin2: HatagoPlugin = async () => {
  // Mock implementation
}

const mockPlugin3: HatagoPlugin = async () => {
  // Mock implementation
}

describe('Registry Core Functions', () => {
  test('createRegistry creates empty registry', () => {
    const registry = createRegistry()
    expect(getPluginCount(registry)).toBe(0)
    expect(isEmpty(registry)).toBe(true)
    expect(getAllPlugins(registry)).toEqual([])
  })

  test('addPlugin adds plugin correctly', () => {
    const registry = createRegistry()
    const newRegistry = addPlugin(registry, 'test1', mockPlugin1)

    expect(getPluginCount(newRegistry)).toBe(1)
    expect(hasPlugin(newRegistry, 'test1')).toBe(true)
    expect(getPlugin(newRegistry, 'test1')).toBe(mockPlugin1)
    expect(isEmpty(newRegistry)).toBe(false)
  })

  test('addPlugin is immutable', () => {
    const registry = createRegistry()
    const newRegistry = addPlugin(registry, 'test1', mockPlugin1)

    // Original registry should be unchanged
    expect(getPluginCount(registry)).toBe(0)
    expect(isEmpty(registry)).toBe(true)

    // New registry should have the plugin
    expect(getPluginCount(newRegistry)).toBe(1)
    expect(hasPlugin(newRegistry, 'test1')).toBe(true)
  })

  test('removePlugin removes plugin correctly', () => {
    let registry = createRegistry()
    registry = addPlugin(registry, 'test1', mockPlugin1)
    registry = addPlugin(registry, 'test2', mockPlugin2)

    const newRegistry = removePlugin(registry, 'test1')

    expect(getPluginCount(newRegistry)).toBe(1)
    expect(hasPlugin(newRegistry, 'test1')).toBe(false)
    expect(hasPlugin(newRegistry, 'test2')).toBe(true)
  })

  test('removePlugin is immutable', () => {
    let registry = createRegistry()
    registry = addPlugin(registry, 'test1', mockPlugin1)

    const newRegistry = removePlugin(registry, 'test1')

    // Original registry should be unchanged
    expect(getPluginCount(registry)).toBe(1)
    expect(hasPlugin(registry, 'test1')).toBe(true)

    // New registry should not have the plugin
    expect(getPluginCount(newRegistry)).toBe(0)
    expect(hasPlugin(newRegistry, 'test1')).toBe(false)
  })

  test('getAllPlugins returns all plugins', () => {
    let registry = createRegistry()
    registry = addPlugin(registry, 'test1', mockPlugin1)
    registry = addPlugin(registry, 'test2', mockPlugin2)

    const plugins = getAllPlugins(registry)
    expect(plugins).toHaveLength(2)
    expect(plugins).toContain(mockPlugin1)
    expect(plugins).toContain(mockPlugin2)
  })

  test('getPluginIds returns all plugin IDs', () => {
    let registry = createRegistry()
    registry = addPlugin(registry, 'test1', mockPlugin1)
    registry = addPlugin(registry, 'test2', mockPlugin2)

    const ids = getPluginIds(registry)
    expect(ids).toHaveLength(2)
    expect(ids).toContain('test1')
    expect(ids).toContain('test2')
  })

  test('clearRegistry creates empty registry', () => {
    let registry = createRegistry()
    registry = addPlugin(registry, 'test1', mockPlugin1)

    const clearedRegistry = clearRegistry()
    expect(getPluginCount(clearedRegistry)).toBe(0)
    expect(isEmpty(clearedRegistry)).toBe(true)
  })

  test('applyMultiplePlugins adds multiple plugins', () => {
    const registry = createRegistry()
    const plugins = [
      { id: 'test1', plugin: mockPlugin1 },
      { id: 'test2', plugin: mockPlugin2 },
      { id: 'test3', plugin: mockPlugin3 },
    ]

    const newRegistry = applyMultiplePlugins(registry, plugins)

    expect(getPluginCount(newRegistry)).toBe(3)
    expect(hasPlugin(newRegistry, 'test1')).toBe(true)
    expect(hasPlugin(newRegistry, 'test2')).toBe(true)
    expect(hasPlugin(newRegistry, 'test3')).toBe(true)
  })

  test('filterPlugins filters correctly', () => {
    let registry = createRegistry()
    registry = addPlugin(registry, 'keep1', mockPlugin1)
    registry = addPlugin(registry, 'remove1', mockPlugin2)
    registry = addPlugin(registry, 'keep2', mockPlugin3)

    const filteredRegistry = filterPlugins(registry, id => id.startsWith('keep'))

    expect(getPluginCount(filteredRegistry)).toBe(2)
    expect(hasPlugin(filteredRegistry, 'keep1')).toBe(true)
    expect(hasPlugin(filteredRegistry, 'keep2')).toBe(true)
    expect(hasPlugin(filteredRegistry, 'remove1')).toBe(false)
  })

  test('mapPlugins transforms correctly', () => {
    let registry = createRegistry()
    registry = addPlugin(registry, 'test1', mockPlugin1)
    registry = addPlugin(registry, 'test2', mockPlugin2)

    const mapped = mapPlugins(registry, (id, plugin) => ({
      id,
      pluginType: typeof plugin,
    }))

    expect(mapped).toHaveLength(2)
    expect(mapped).toEqual([
      { id: 'test1', pluginType: 'function' },
      { id: 'test2', pluginType: 'function' },
    ])
  })

  test('getPlugin returns undefined for non-existent plugin', () => {
    const registry = createRegistry()
    expect(getPlugin(registry, 'nonexistent')).toBeUndefined()
  })

  test('hasPlugin returns false for non-existent plugin', () => {
    const registry = createRegistry()
    expect(hasPlugin(registry, 'nonexistent')).toBe(false)
  })

  test('removePlugin handles non-existent plugin gracefully', () => {
    const registry = createRegistry()
    const newRegistry = removePlugin(registry, 'nonexistent')

    expect(getPluginCount(newRegistry)).toBe(0)
    expect(isEmpty(newRegistry)).toBe(true)
  })
})
