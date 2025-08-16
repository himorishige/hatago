/**
 * Functional plugin registry implementation
 * Pure functions for managing plugin state
 */

import type { HatagoPlugin } from '../types.js'

/**
 * Immutable registry state
 */
export type RegistryState = Readonly<{
  plugins: ReadonlyMap<string, HatagoPlugin>
}>

/**
 * Create a new empty registry state
 */
export const createRegistry = (): RegistryState => ({
  plugins: new Map(),
})

/**
 * Add a plugin to the registry (pure function)
 */
export const addPlugin = (
  state: RegistryState,
  id: string,
  plugin: HatagoPlugin
): RegistryState => ({
  plugins: new Map([...state.plugins, [id, plugin]]),
})

/**
 * Remove a plugin from the registry (pure function)
 */
export const removePlugin = (state: RegistryState, id: string): RegistryState => {
  const newPlugins = new Map(state.plugins)
  newPlugins.delete(id)
  return { plugins: newPlugins }
}

/**
 * Get a plugin by ID (pure function)
 */
export const getPlugin = (state: RegistryState, id: string): HatagoPlugin | undefined => {
  return state.plugins.get(id)
}

/**
 * Get all registered plugins (pure function)
 */
export const getAllPlugins = (state: RegistryState): readonly HatagoPlugin[] => {
  return [...state.plugins.values()]
}

/**
 * Get all plugin IDs (pure function)
 */
export const getPluginIds = (state: RegistryState): readonly string[] => {
  return [...state.plugins.keys()]
}

/**
 * Check if a plugin exists (pure function)
 */
export const hasPlugin = (state: RegistryState, id: string): boolean => {
  return state.plugins.has(id)
}

/**
 * Get the number of registered plugins (pure function)
 */
export const getPluginCount = (state: RegistryState): number => {
  return state.plugins.size
}

/**
 * Check if registry is empty (pure function)
 */
export const isEmpty = (state: RegistryState): boolean => {
  return state.plugins.size === 0
}

/**
 * Clear all plugins from registry (pure function)
 */
export const clearRegistry = (): RegistryState => ({
  plugins: new Map(),
})

/**
 * Apply multiple plugins to the registry (pure function)
 */
export const applyMultiplePlugins = (
  state: RegistryState,
  plugins: Array<{ id: string; plugin: HatagoPlugin }>
): RegistryState => {
  const newPlugins = new Map(state.plugins)
  for (const { id, plugin } of plugins) {
    newPlugins.set(id, plugin)
  }
  return { plugins: newPlugins }
}

/**
 * Filter plugins by predicate (pure function)
 */
export const filterPlugins = (
  state: RegistryState,
  predicate: (id: string, plugin: HatagoPlugin) => boolean
): RegistryState => {
  const newPlugins = new Map<string, HatagoPlugin>()
  for (const [id, plugin] of state.plugins) {
    if (predicate(id, plugin)) {
      newPlugins.set(id, plugin)
    }
  }
  return { plugins: newPlugins }
}

/**
 * Transform plugins (pure function)
 */
export const mapPlugins = <T>(
  state: RegistryState,
  mapper: (id: string, plugin: HatagoPlugin) => T
): readonly T[] => {
  const results: T[] = []
  for (const [id, plugin] of state.plugins) {
    results.push(mapper(id, plugin))
  }
  return results
}
