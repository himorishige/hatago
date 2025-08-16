/**
 * Functional plugin host implementation with state machine pattern
 * Pure functions for managing plugin host state
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CapabilityAwarePlugin, CapabilityRegistry, PluginManifest } from '../types.js'

/**
 * Plugin host states
 */
export type HostState = 'idle' | 'loading' | 'running' | 'stopped' | 'error'

/**
 * Loaded plugin information
 */
export type LoadedPlugin = Readonly<{
  manifest: PluginManifest
  plugin: CapabilityAwarePlugin
  loadedAt: number
}>

/**
 * Immutable host state
 */
export type HostStateContext = Readonly<{
  state: HostState
  runtime: 'node' | 'workers'
  server: McpServer
  loadedPlugins: ReadonlyMap<string, LoadedPlugin>
  availableCapabilities: ReadonlySet<string>
  error: string | null
}>

/**
 * Effect for side effects (loading plugins, logging, etc.)
 */
export type Effect = Readonly<{
  type: 'loadPlugin' | 'log' | 'error'
  payload: unknown
}>

/**
 * Host transition result with optional effects
 */
export type HostTransition = Readonly<{
  state: HostStateContext
  effects: readonly Effect[]
}>

/**
 * Create initial host state
 */
export const createHost = (server: McpServer, runtime: 'node' | 'workers'): HostStateContext => {
  const availableCapabilities = new Set(['logger'])

  if (runtime === 'node') {
    availableCapabilities.add('fetch')
    availableCapabilities.add('kv')
    availableCapabilities.add('timer')
    availableCapabilities.add('crypto')
  } else if (runtime === 'workers') {
    availableCapabilities.add('fetch')
    availableCapabilities.add('kv')
    availableCapabilities.add('crypto')
  }

  return {
    state: 'idle',
    runtime,
    server,
    loadedPlugins: new Map(),
    availableCapabilities,
    error: null,
  }
}

/**
 * Start loading a plugin (pure function)
 */
export const startLoading = (
  hostState: HostStateContext,
  manifest: PluginManifest
): HostTransition => {
  if (hostState.state !== 'idle') {
    return {
      state: { ...hostState, state: 'error', error: 'Host not in idle state' },
      effects: [
        {
          type: 'error',
          payload: { message: 'Cannot load plugin: host not in idle state' },
        },
      ],
    }
  }

  // Validate manifest
  const manifestValidation = validateManifest(manifest)
  if (!manifestValidation.valid) {
    return {
      state: {
        ...hostState,
        state: 'error',
        error: manifestValidation.error,
      },
      effects: [
        {
          type: 'error',
          payload: { message: manifestValidation.error },
        },
      ],
    }
  }

  // Validate capabilities
  const capabilityValidation = validateCapabilities(hostState, manifest)
  if (!capabilityValidation.valid) {
    return {
      state: {
        ...hostState,
        state: 'error',
        error: capabilityValidation.error,
      },
      effects: [
        {
          type: 'error',
          payload: { message: capabilityValidation.error },
        },
      ],
    }
  }

  return {
    state: { ...hostState, state: 'loading' },
    effects: [
      {
        type: 'loadPlugin',
        payload: { manifest },
      },
      {
        type: 'log',
        payload: { level: 'info', message: `Loading plugin: ${manifest.name}` },
      },
    ],
  }
}

/**
 * Complete plugin loading (pure function)
 */
export const completeLoading = (
  hostState: HostStateContext,
  manifest: PluginManifest,
  plugin: CapabilityAwarePlugin
): HostTransition => {
  if (hostState.state !== 'loading') {
    return {
      state: { ...hostState, state: 'error', error: 'Host not in loading state' },
      effects: [
        {
          type: 'error',
          payload: { message: 'Cannot complete loading: host not in loading state' },
        },
      ],
    }
  }

  const loadedPlugin: LoadedPlugin = {
    manifest,
    plugin,
    loadedAt: Date.now(),
  }

  const newLoadedPlugins = new Map(hostState.loadedPlugins)
  newLoadedPlugins.set(manifest.name, loadedPlugin)

  return {
    state: {
      ...hostState,
      state: 'running',
      loadedPlugins: newLoadedPlugins,
      error: null,
    },
    effects: [
      {
        type: 'log',
        payload: {
          level: 'info',
          message: `Plugin loaded successfully: ${manifest.name}@${manifest.version}`,
        },
      },
    ],
  }
}

/**
 * Handle loading error (pure function)
 */
export const handleLoadingError = (hostState: HostStateContext, error: string): HostTransition => {
  return {
    state: { ...hostState, state: 'error', error },
    effects: [
      {
        type: 'error',
        payload: { message: `Plugin loading failed: ${error}` },
      },
    ],
  }
}

/**
 * Stop the host (pure function)
 */
export const stopHost = (hostState: HostStateContext): HostTransition => {
  if (hostState.state === 'stopped') {
    return {
      state: hostState,
      effects: [],
    }
  }

  return {
    state: { ...hostState, state: 'stopped' },
    effects: [
      {
        type: 'log',
        payload: { level: 'info', message: 'Plugin host stopped' },
      },
    ],
  }
}

/**
 * Reset host to idle state (pure function)
 */
export const resetHost = (hostState: HostStateContext): HostTransition => {
  return {
    state: { ...hostState, state: 'idle', error: null },
    effects: [
      {
        type: 'log',
        payload: { level: 'info', message: 'Plugin host reset to idle' },
      },
    ],
  }
}

/**
 * Get loaded plugin (pure function)
 */
export const getLoadedPlugin = (
  hostState: HostStateContext,
  name: string
): LoadedPlugin | undefined => {
  return hostState.loadedPlugins.get(name)
}

/**
 * Get all loaded plugins (pure function)
 */
export const getAllLoadedPlugins = (hostState: HostStateContext): readonly LoadedPlugin[] => {
  return [...hostState.loadedPlugins.values()]
}

/**
 * Check if capability is available (pure function)
 */
export const hasCapability = (hostState: HostStateContext, capability: string): boolean => {
  return hostState.availableCapabilities.has(capability)
}

/**
 * Get all available capabilities (pure function)
 */
export const getCapabilities = (hostState: HostStateContext): readonly string[] => {
  return [...hostState.availableCapabilities]
}

/**
 * Validate plugin manifest (pure function)
 */
export const validateManifest = (
  manifest: PluginManifest
): { valid: true } | { valid: false; error: string } => {
  if (!manifest.name || !manifest.version || !manifest.description) {
    return {
      valid: false,
      error: 'Invalid plugin manifest: missing required fields',
    }
  }

  if (!manifest.engines?.hatago) {
    return {
      valid: false,
      error: 'Invalid plugin manifest: missing engines.hatago',
    }
  }

  if (!Array.isArray(manifest.capabilities)) {
    return {
      valid: false,
      error: 'Invalid plugin manifest: capabilities must be an array',
    }
  }

  if (!manifest.entry?.default) {
    return {
      valid: false,
      error: 'Invalid plugin manifest: missing entry.default',
    }
  }

  return { valid: true }
}

/**
 * Validate plugin capabilities (pure function)
 */
export const validateCapabilities = (
  hostState: HostStateContext,
  manifest: PluginManifest
): { valid: true } | { valid: false; error: string } => {
  for (const capability of manifest.capabilities) {
    if (!hasCapability(hostState, capability)) {
      return {
        valid: false,
        error: `Plugin '${manifest.name}' requires unavailable capability: ${capability}`,
      }
    }
  }
  return { valid: true }
}

/**
 * Create capability registry for a plugin (effect function)
 */
export const createCapabilityRegistry = (
  hostState: HostStateContext,
  manifest: PluginManifest
): CapabilityRegistry => {
  const capabilities: Partial<CapabilityRegistry> = {}

  // Always provide logger (core capability)
  capabilities.logger = createLoggerCapability(manifest.name)

  // Add optional capabilities based on manifest declarations
  for (const capability of manifest.capabilities) {
    switch (capability) {
      case 'fetch':
        if (hasCapability(hostState, 'fetch')) {
          capabilities.fetch = createFetchCapability(manifest.name)
        }
        break
      case 'kv':
        if (hasCapability(hostState, 'kv')) {
          capabilities.kv = createKVCapability(manifest.name)
        }
        break
      case 'timer':
        if (hasCapability(hostState, 'timer')) {
          capabilities.timer = createTimerCapability(manifest.name)
        }
        break
      case 'crypto':
        if (hasCapability(hostState, 'crypto')) {
          capabilities.crypto = createCryptoCapability(manifest.name)
        }
        break
    }
  }

  return capabilities as CapabilityRegistry
}

// Capability implementations (side effects allowed)
function createLoggerCapability(pluginName: string) {
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

function createFetchCapability(pluginName: string) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    console.log(
      `[${pluginName}] HTTP request:`,
      typeof input === 'string' ? input : input.toString()
    )
    return fetch(input, init)
  }
}

function createKVCapability(pluginName: string) {
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

function createTimerCapability(pluginName: string) {
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

function createCryptoCapability(pluginName: string) {
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
