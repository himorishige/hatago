import type { HatagoContext, HatagoPlugin } from './types.js'

/**
 * Apply plugins to the Hatago context
 * Plugins are applied in sequence and can be async
 */
export async function applyPlugins(plugins: HatagoPlugin[], ctx: HatagoContext): Promise<void> {
  for (const plugin of plugins) {
    await plugin(ctx)
  }
}

/**
 * Create a plugin registry for managing plugins dynamically
 */
export class PluginRegistry {
  private plugins: Map<string, HatagoPlugin> = new Map()

  /**
   * Register a plugin with an ID
   */
  register(id: string, plugin: HatagoPlugin): void {
    this.plugins.set(id, plugin)
  }

  /**
   * Unregister a plugin
   */
  unregister(id: string): boolean {
    return this.plugins.delete(id)
  }

  /**
   * Get all registered plugins
   */
  getAll(): HatagoPlugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Get plugin by ID
   */
  get(id: string): HatagoPlugin | undefined {
    return this.plugins.get(id)
  }

  /**
   * Apply all registered plugins to context
   */
  async applyAll(ctx: HatagoContext): Promise<void> {
    await applyPlugins(this.getAll(), ctx)
  }
}
