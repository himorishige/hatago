import type { HatagoContext, HatagoPlugin } from './types.js'

/**
 * Apply plugins to the Hatago context
 * Plugins are applied in sequence and can be async
 */
export async function applyPlugins(
  plugins: readonly HatagoPlugin[],
  ctx: HatagoContext
): Promise<void> {
  for (const plugin of plugins) {
    await plugin(ctx)
  }
}

// Re-export functional core for new implementations
export * from './core/registry.js'

// Re-export adapter for backwards compatibility
export { PluginRegistry, PluginRegistryAdapter } from './adapters/registry-adapter.js'
