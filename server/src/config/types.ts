/**
 * Configuration types for enhanced MCP proxy
 */

export interface MCPServerConfig {
  id: string
  endpoint: string
  description?: string
  auth?: AuthConfig
  timeout?: number
  healthCheck?: HealthCheckConfig
  includedTools?: string[]
  excludedTools?: string[]
}

export interface AuthConfig {
  type: 'bearer' | 'basic' | 'custom'
  token?: string
  username?: string
  password?: string
  headers?: Record<string, string>
}

export interface HealthCheckConfig {
  enabled: boolean
  interval?: number
  timeout?: number
}

export interface NamespaceConfig {
  separator?: string
  caseSensitive?: boolean
  maxLength?: number
  autoPrefix?: {
    enabled: boolean
    format: string
  }
}

export interface ProxyConfig {
  servers: MCPServerConfig[]
  namespaceStrategy: 'prefix' | 'suffix' | 'none'
  conflictResolution: 'error' | 'rename' | 'skip'
  namespace?: NamespaceConfig
  connectionPool?: {
    maxConnections?: number
    idleTimeout?: number
    keepAlive?: boolean
  }
}

export interface ServerConfig {
  port?: number
  hostname?: string
  cors?: boolean
  timeout?: number
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error'
  format: 'json' | 'pretty'
  output: 'console' | 'file'
  file?: string
}

export interface SecurityConfig {
  requireAuth?: boolean
  allowedOrigins?: string[]
  rateLimit?: {
    enabled: boolean
    windowMs?: number
    maxRequests?: number
  }
}

export interface HatagoConfig {
  proxy?: ProxyConfig
  server?: ServerConfig
  logging?: LoggingConfig
  security?: SecurityConfig
}