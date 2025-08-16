import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Hono } from 'hono'

/**
 * Hatago transport mode
 */
export type HatagoMode = 'stdio' | 'http'

/**
 * Runtime-agnostic context provided to plugins
 * Only uses Web Standard APIs to ensure compatibility across all runtimes
 */
export interface HatagoContext {
  /** Hono app instance for HTTP routes (null in stdio mode) */
  app: Hono | null

  /** MCP server instance for tools/resources */
  server: McpServer

  /** Environment variables (runtime-specific) */
  env?: Record<string, unknown>

  /** Base URL helper (only available in HTTP mode) */
  getBaseUrl: (req: Request) => URL

  /** Transport mode */
  mode?: HatagoMode
}

/**
 * Plugin function type
 * Plugins modify the context by registering tools, routes, etc.
 */
export type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>

/**
 * Plugin factory type for plugins that need configuration
 */
export type HatagoPluginFactory<T = any> = (config?: T) => HatagoPlugin

/**
 * MCP server configuration for proxy functionality
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string

  /** Server endpoint URL */
  endpoint: string

  /** Optional authentication config */
  auth?: {
    type: 'bearer' | 'basic' | 'custom'
    token?: string
    username?: string
    password?: string
    headers?: Record<string, string>
  }

  /** Transport type */
  transport?: 'http' | 'websocket' | 'stdio'

  /** Connection timeout in milliseconds */
  timeout?: number

  /** Health check configuration */
  healthCheck?: {
    enabled: boolean
    interval: number
    path?: string
  }
}

/**
 * MCP proxy configuration
 */
export interface MCPProxyConfig {
  /** List of MCP servers to proxy */
  servers: MCPServerConfig[]

  /** Namespace strategy for tool names */
  namespaceStrategy: 'prefix' | 'flat'

  /** Name conflict resolution */
  conflictResolution: 'error' | 'first-wins' | 'prompt'

  /** Global timeout for MCP calls */
  defaultTimeout?: number

  /** Enable/disable progress notifications */
  enableProgress?: boolean
}

/**
 * Tool metadata for unified tool registry
 */
export interface ToolDescriptor {
  /** Tool name */
  name: string

  /** Namespace/origin (local or server ID) */
  namespace: string

  /** Tool title */
  title?: string

  /** Tool description */
  description?: string

  /** Input schema */
  inputSchema: any

  /** Whether tool supports streaming */
  streaming?: boolean

  /** Authentication requirements */
  auth?: 'inherit' | 'server' | 'none'

  /** Source server (for proxied tools) */
  serverConfig?: MCPServerConfig
}

// ===== NEW PLUGIN SYSTEM TYPES =====

/**
 * Plugin manifest schema (hatago.plugin.json)
 */
export interface PluginManifest {
  /** Plugin package name */
  name: string
  /** Semantic version */
  version: string
  /** Human-readable description */
  description: string
  /** Runtime requirements */
  engines: {
    /** Compatible Hatago core version */
    hatago: string
    /** Node.js version requirement (optional) */
    node?: string
    /** Cloudflare Workers compatibility date (optional) */
    workers?: string
  }
  /** Required capabilities */
  capabilities: string[]
  /** Runtime-specific entry points */
  entry: {
    node?: string
    workers?: string
    default: string
  }
  /** MCP tool declarations (optional) */
  mcp?: {
    tools?: Array<{
      name: string
      title: string
      description: string
    }>
  }
}

/**
 * Plugin context passed to plugin factory
 */
export interface PluginContext {
  /** Plugin manifest */
  manifest: PluginManifest
  /** Plugin configuration */
  config: Record<string, unknown>
  /** Current runtime */
  runtime: 'node' | 'workers'
}

/**
 * Capability-aware plugin function
 */
export type CapabilityAwarePlugin = (ctx: { server: McpServer; capabilities: CapabilityRegistry }) => void | Promise<void>

/**
 * New plugin factory type with capability context
 */
export type CapabilityAwarePluginFactory = (context: PluginContext) => CapabilityAwarePlugin

/**
 * Core capabilities registry
 */
export interface CapabilityRegistry {
  logger: Logger
  fetch?: typeof fetch
  kv?: KV
  timer?: Timer
  crypto?: Crypto
}

/**
 * Logger capability interface
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>, error?: Error): void
}

/**
 * Key-value storage capability
 */
export interface KV {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Timer capability
 */
export interface Timer {
  setTimeout(callback: () => void, delay: number): number
  clearTimeout(id: number): void
  setInterval(callback: () => void, delay: number): number
  clearInterval(id: number): void
}

/**
 * Crypto capability
 */
export interface Crypto {
  randomUUID(): string
  getRandomValues<T extends ArrayBufferView>(array: T): T
}

/**
 * Plugin host for managing capability-aware plugins
 */
export interface PluginHost {
  /** Load plugin from manifest */
  loadPlugin(manifest: PluginManifest, config?: Record<string, unknown>): Promise<void>
  /** Get available capabilities */
  getCapabilities(): string[]
  /** Check if capability is available */
  hasCapability(name: string): boolean
}

/**
 * Capability error thrown when accessing undeclared capabilities
 */
export class CapabilityError extends Error {
  constructor(capability: string, plugin: string) {
    super(`Plugin '${plugin}' attempted to use undeclared capability '${capability}'`)
    this.name = 'CapabilityError'
  }
}
