// Re-export functional core for new implementations
export * from './core/host.js'

// Re-export adapter for backwards compatibility
export { DefaultPluginHost, DefaultPluginHostAdapter } from './adapters/host-adapter.js'
