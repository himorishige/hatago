/**
 * Compatibility adapter for existing PluginRegistry class API
 * Provides the same interface while using functional core underneath
 */

import type { RegistryState } from '../core/registry.js'
import {
  addPlugin as addPluginCore,
  clearRegistry,
  createRegistry,
  getAllPlugins,
  getPlugin,
  getPluginCount,
  getPluginIds,
  hasPlugin,
  isEmpty,
  removePlugin as removePluginCore,
} from '../core/registry.js'
import type { HatagoPlugin } from '../types.js'

/**
 * Class-based adapter for PluginRegistry
 * Maintains existing API while using functional core
 */
export class PluginRegistryAdapter {
  private state: RegistryState

  constructor() {
    this.state = createRegistry()
  }

  /**
   * Register a plugin with an ID
   */
  register(id: string, plugin: HatagoPlugin): void {
    this.state = addPluginCore(this.state, id, plugin)
  }

  /**
   * Unregister a plugin
   */
  unregister(id: string): boolean {
    const existed = hasPlugin(this.state, id)
    if (existed) {
      this.state = removePluginCore(this.state, id)
    }
    return existed
  }

  /**
   * Get all registered plugins
   */
  getAll(): HatagoPlugin[] {
    return [...getAllPlugins(this.state)]
  }

  /**
   * Get plugin by ID
   */
  get(id: string): HatagoPlugin | undefined {
    return getPlugin(this.state, id)
  }

  /**
   * Check if plugin exists
   */
  has(id: string): boolean {
    return hasPlugin(this.state, id)
  }

  /**
   * Get all plugin IDs
   */
  getIds(): string[] {
    return [...getPluginIds(this.state)]
  }

  /**
   * Get the number of registered plugins
   */
  size(): number {
    return getPluginCount(this.state)
  }

  /**
   * Check if registry is empty
   */
  isEmpty(): boolean {
    return isEmpty(this.state)
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.state = clearRegistry()
  }

  /**
   * Get a snapshot of the current state (for testing/debugging)
   */
  getSnapshot(): RegistryState {
    return this.state
  }

  /**
   * Apply all registered plugins to context
   * Note: This method maintains the existing signature from the original implementation
   */
  async applyAll(ctx: { server: unknown; app: unknown | null }): Promise<void> {
    const plugins = getAllPlugins(this.state)
    for (const plugin of plugins) {
      await plugin(ctx as Parameters<HatagoPlugin>[0])
    }
  }
}

/**
 * Legacy alias for backwards compatibility
 * @deprecated Use PluginRegistryAdapter instead
 */
export const PluginRegistry = PluginRegistryAdapter
