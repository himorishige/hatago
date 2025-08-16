import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type {
  CapabilityAwarePlugin,
  CapabilityAwarePluginFactory,
  CapabilityRegistry,
  Crypto,
  KV,
  Logger,
  PluginHost,
  PluginManifest,
  Timer,
} from './types.js'
import { CapabilityError } from './types.js'

/**
 * Default plugin host implementation with capability-based security
 */
export class DefaultPluginHost implements PluginHost {
  private loadedPlugins = new Map<string, CapabilityAwarePlugin>()
  private availableCapabilities = new Set<string>()
  private server: McpServer
  private runtime: 'node' | 'workers'

  constructor(server: McpServer, runtime: 'node' | 'workers') {
    this.server = server
    this.runtime = runtime

    // Register core capabilities
    this.availableCapabilities.add('logger')
    if (runtime === 'node') {
      this.availableCapabilities.add('fetch')
      this.availableCapabilities.add('kv')
      this.availableCapabilities.add('timer')
      this.availableCapabilities.add('crypto')
    } else if (runtime === 'workers') {
      this.availableCapabilities.add('fetch')
      this.availableCapabilities.add('kv')
      this.availableCapabilities.add('crypto')
      // Note: timer capability limited in Workers
    }
  }

  async loadPlugin(manifest: PluginManifest, config: Record<string, unknown> = {}): Promise<void> {
    // Validate manifest
    this.validateManifest(manifest)

    // Check capability requirements
    this.validateCapabilities(manifest)

    // Check runtime compatibility
    this.validateRuntime(manifest)

    // Create capability registry with proxy for security
    const capabilities = this.createCapabilityRegistry(manifest)

    // Load plugin entry point
    const entryPoint = this.resolveEntryPoint(manifest)
    const pluginFactory = await this.loadPluginFactory(entryPoint)

    // Create plugin instance
    const pluginContext = {
      manifest,
      config,
      runtime: this.runtime,
    }

    const plugin = pluginFactory(pluginContext)

    // Execute plugin with capabilities
    await plugin({ server: this.server, capabilities })

    // Store loaded plugin
    this.loadedPlugins.set(manifest.name, plugin)

    console.log(`Plugin '${manifest.name}@${manifest.version}' loaded successfully`)
  }

  getCapabilities(): string[] {
    return Array.from(this.availableCapabilities)
  }

  hasCapability(name: string): boolean {
    return this.availableCapabilities.has(name)
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name || !manifest.version || !manifest.description) {
      throw new Error('Invalid plugin manifest: missing required fields')
    }

    if (!manifest.engines?.hatago) {
      throw new Error('Invalid plugin manifest: missing engines.hatago')
    }

    if (!Array.isArray(manifest.capabilities)) {
      throw new Error('Invalid plugin manifest: capabilities must be an array')
    }

    if (!manifest.entry?.default) {
      throw new Error('Invalid plugin manifest: missing entry.default')
    }
  }

  private validateCapabilities(manifest: PluginManifest): void {
    for (const capability of manifest.capabilities) {
      if (!this.hasCapability(capability)) {
        throw new Error(`Plugin '${manifest.name}' requires unavailable capability: ${capability}`)
      }
    }
  }

  private validateRuntime(manifest: PluginManifest): void {
    const engines = manifest.engines

    if (this.runtime === 'node' && engines.node) {
      // TODO: Add semver version checking
      // For now, just log the requirement
      console.log(`Plugin requires Node.js ${engines.node}`)
    }

    if (this.runtime === 'workers' && engines.workers) {
      // TODO: Add Workers compatibility date checking
      console.log(`Plugin requires Workers compatibility ${engines.workers}`)
    }
  }

  private createCapabilityRegistry(manifest: PluginManifest): CapabilityRegistry {
    const capabilities: Partial<CapabilityRegistry> = {}

    // Always provide logger (core capability)
    capabilities.logger = this.createLoggerCapability(manifest.name)

    // Add optional capabilities based on manifest declarations
    for (const capability of manifest.capabilities) {
      switch (capability) {
        case 'fetch':
          if (this.hasCapability('fetch')) {
            capabilities.fetch = this.createFetchCapability(manifest.name)
          }
          break
        case 'kv':
          if (this.hasCapability('kv')) {
            capabilities.kv = this.createKVCapability(manifest.name)
          }
          break
        case 'timer':
          if (this.hasCapability('timer')) {
            capabilities.timer = this.createTimerCapability(manifest.name)
          }
          break
        case 'crypto':
          if (this.hasCapability('crypto')) {
            capabilities.crypto = this.createCryptoCapability(manifest.name)
          }
          break
      }
    }

    return capabilities as CapabilityRegistry
  }

  private createLoggerCapability(pluginName: string): Logger {
    const prefix = `[${pluginName}]`
    return {
      debug: (message: string, meta?: object) => {
        console.debug(`${prefix} ${message}`, meta ? JSON.stringify(meta) : '')
      },
      info: (message: string, meta?: object) => {
        console.log(`${prefix} ${message}`, meta ? JSON.stringify(meta) : '')
      },
      warn: (message: string, meta?: object) => {
        console.warn(`${prefix} ${message}`, meta ? JSON.stringify(meta) : '')
      },
      error: (message: string, meta?: object) => {
        console.error(`${prefix} ${message}`, meta ? JSON.stringify(meta) : '')
      },
    }
  }

  private createFetchCapability(pluginName: string): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Log fetch usage for auditing
      console.log(
        `[${pluginName}] HTTP request:`,
        typeof input === 'string' ? input : input.toString()
      )
      return fetch(input, init)
    }
  }

  private createKVCapability(pluginName: string): KV {
    // Simple in-memory implementation for demo
    // In production, this would be backed by actual storage
    const storage = new Map<string, { value: string; expires?: number }>()

    return {
      async get(key: string): Promise<string | null> {
        console.log(`[${pluginName}] KV get: ${key}`)
        const item = storage.get(key)
        if (!item) return null
        if (item.expires && Date.now() > item.expires) {
          storage.delete(key)
          return null
        }
        return item.value
      },

      async set(key: string, value: string, ttl?: number): Promise<void> {
        console.log(`[${pluginName}] KV set: ${key}`)
        const item = ttl ? { value, expires: Date.now() + ttl * 1000 } : { value }
        storage.set(key, item)
      },

      async delete(key: string): Promise<void> {
        console.log(`[${pluginName}] KV delete: ${key}`)
        storage.delete(key)
      },
    }
  }

  private createTimerCapability(pluginName: string): Timer {
    return {
      setTimeout: (callback: () => void, delay: number): number => {
        console.log(`[${pluginName}] setTimeout: ${delay}ms`)
        return setTimeout(callback, delay) as unknown as number
      },
      clearTimeout: (id: number): void => {
        console.log(`[${pluginName}] clearTimeout: ${id}`)
        clearTimeout(id)
      },
      setInterval: (callback: () => void, delay: number): number => {
        console.log(`[${pluginName}] setInterval: ${delay}ms`)
        return setInterval(callback, delay) as unknown as number
      },
      clearInterval: (id: number): void => {
        console.log(`[${pluginName}] clearInterval: ${id}`)
        clearInterval(id)
      },
    }
  }

  private createCryptoCapability(pluginName: string): Crypto {
    return {
      randomUUID: (): string => {
        console.log(`[${pluginName}] randomUUID`)
        return crypto.randomUUID()
      },
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        console.log(`[${pluginName}] getRandomValues`)
        return crypto.getRandomValues(array)
      },
    }
  }

  private resolveEntryPoint(manifest: PluginManifest): string {
    const entry = manifest.entry

    if (this.runtime === 'node' && entry.node) {
      return entry.node
    }

    if (this.runtime === 'workers' && entry.workers) {
      return entry.workers
    }

    return entry.default
  }

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
}

/**
 * Create a secure capability proxy that validates access
 */
function _createCapabilityProxy<T extends object>(
  capability: T,
  allowedMethods: Set<string>,
  pluginName: string
): T {
  return new Proxy(capability, {
    get(target, prop) {
      if (typeof prop === 'string' && !allowedMethods.has(prop)) {
        throw new CapabilityError(prop, pluginName)
      }
      return target[prop as keyof T]
    },
  })
}
