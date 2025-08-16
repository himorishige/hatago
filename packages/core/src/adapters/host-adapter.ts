/**
 * Compatibility adapter for DefaultPluginHost class API
 * Provides the same interface while using functional core underneath
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { HostStateContext, HostTransition } from '../core/host.js'
import {
  completeLoading,
  createCapabilityRegistry,
  createHost,
  getCapabilities,
  handleLoadingError,
  hasCapability as hasCapabilityCore,
  startLoading,
  stopHost,
} from '../core/host.js'
import type {
  CapabilityAwarePlugin,
  CapabilityAwarePluginFactory,
  PluginHost,
  PluginManifest,
} from '../types.js'

/**
 * Class-based adapter for DefaultPluginHost
 * Maintains existing API while using functional core with state machine
 */
export class DefaultPluginHostAdapter implements PluginHost {
  private state: HostStateContext

  constructor(server: McpServer, runtime: 'node' | 'workers') {
    this.state = createHost(server, runtime)
  }

  async loadPlugin(manifest: PluginManifest, config: Record<string, unknown> = {}): Promise<void> {
    // Start loading transition
    const loadingTransition = startLoading(this.state, manifest)
    this.state = loadingTransition.state
    this.executeEffects(loadingTransition.effects)

    if (this.state.state === 'error') {
      throw new Error(this.state.error ?? 'Unknown error during plugin loading')
    }

    try {
      // Create capability registry
      const capabilities = createCapabilityRegistry(this.state, manifest)

      // Load plugin entry point
      const entryPoint = this.resolveEntryPoint(manifest)
      const pluginFactory = await this.loadPluginFactory(entryPoint)

      // Create plugin instance
      const pluginContext = {
        manifest,
        config,
        runtime: this.state.runtime,
      }

      const plugin = pluginFactory(pluginContext)

      // Execute plugin with capabilities
      await plugin({ server: this.state.server, capabilities })

      // Complete loading transition
      const completionTransition = completeLoading(this.state, manifest, plugin)
      this.state = completionTransition.state
      this.executeEffects(completionTransition.effects)
    } catch (error) {
      // Handle loading error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorTransition = handleLoadingError(this.state, errorMessage)
      this.state = errorTransition.state
      this.executeEffects(errorTransition.effects)
      throw error
    }
  }

  getCapabilities(): string[] {
    return [...getCapabilities(this.state)]
  }

  hasCapability(name: string): boolean {
    return hasCapabilityCore(this.state, name)
  }

  /**
   * Stop the plugin host
   */
  stop(): void {
    const stopTransition = stopHost(this.state)
    this.state = stopTransition.state
    this.executeEffects(stopTransition.effects)
  }

  /**
   * Get current state (for debugging/testing)
   */
  getState(): HostStateContext {
    return this.state
  }

  /**
   * Get plugin factory from entry point
   */
  private async loadPluginFactory(entryPoint: string): Promise<CapabilityAwarePluginFactory> {
    try {
      // Dynamic import for ESM compatibility
      const module = await import(entryPoint)
      const factory = module.default || module

      if (typeof factory !== 'function') {
        throw new Error('Plugin entry point must export a default function')
      }

      return factory as CapabilityAwarePluginFactory
    } catch (error) {
      throw new Error(`Failed to load plugin from ${entryPoint}: ${error}`)
    }
  }

  /**
   * Resolve entry point for current runtime
   */
  private resolveEntryPoint(manifest: PluginManifest): string {
    const entry = manifest.entry

    if (this.state.runtime === 'node' && entry.node) {
      return entry.node
    }

    if (this.state.runtime === 'workers' && entry.workers) {
      return entry.workers
    }

    return entry.default
  }

  /**
   * Execute side effects from state transitions
   */
  private executeEffects(effects: readonly import('../core/host.js').Effect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'log':
          this.executeLogEffect(effect.payload)
          break
        case 'error':
          this.executeErrorEffect(effect.payload)
          break
        case 'loadPlugin':
          // Plugin loading is handled in loadPlugin method
          break
      }
    }
  }

  /**
   * Execute log effect
   */
  private executeLogEffect(payload: unknown): void {
    const logData = payload as { level: string; message: string }
    switch (logData.level) {
      case 'debug':
        console.debug(logData.message)
        break
      case 'info':
        console.log(logData.message)
        break
      case 'warn':
        console.warn(logData.message)
        break
      case 'error':
        console.error(logData.message)
        break
    }
  }

  /**
   * Execute error effect
   */
  private executeErrorEffect(payload: unknown): void {
    const errorData = payload as { message: string }
    console.error(errorData.message)
  }
}

/**
 * Legacy alias for backwards compatibility
 * @deprecated Use DefaultPluginHostAdapter instead
 */
export const DefaultPluginHost = DefaultPluginHostAdapter
