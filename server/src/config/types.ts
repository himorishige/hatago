/**
 * Configuration types for Hatago MCP server
 */

export interface AuthConfig {
  type: 'bearer' | 'basic' | 'custom'
  token?: string
  username?: string
  password?: string
  headers?: Record<string, string>
}

export interface ToolMapping {
  /** Rename tools from original name to new name */
  rename?: Record<string, string>
  /** Exclude specific tools (supports wildcards) */
  exclude?: string[]
  /** Include only specific tools (supports wildcards) */
  include?: string[]
}

export interface NamespaceConfig {
  /** Separator character for namespaces (default: ':') */
  separator?: string
  /** Case sensitivity for tool names (default: false) */
  caseSensitive?: boolean
  /** Maximum tool name length (default: 64) */
  maxLength?: number
  /** Auto prefix generation */
  autoPrefix?: {
    enabled: boolean
    format: string  // e.g., '{server}_{index}'
  }
  /** Versioning support */
  versioning?: {
    enabled: boolean
    strategy: 'semver' | 'date' | 'custom'
    fallback: string
  }
}

export interface MCPServerConfig {
  /** Unique server identifier */
  id: string
  /** MCP server endpoint URL */
  endpoint: string
  /** Optional custom namespace (default: uses id) */
  namespace?: string
  /** Server description */
  description?: string
  /** Authentication configuration */
  auth?: AuthConfig
  /** Tool mapping and filtering */
  tools?: ToolMapping
  /** Connection timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Retry configuration */
  retry?: {
    attempts: number
    delay: number
    backoff: 'linear' | 'exponential'
  }
  /** Health check configuration */
  healthCheck?: {
    enabled: boolean
    interval: number  // milliseconds
    timeout: number   // milliseconds
  }
}

export interface ProxyConfig {
  /** List of MCP servers to connect to */
  servers: MCPServerConfig[]
  /** Namespace strategy for tool naming */
  namespaceStrategy: 'prefix' | 'suffix' | 'custom'
  /** Conflict resolution strategy */
  conflictResolution: 'error' | 'rename' | 'skip'
  /** Global namespace configuration */
  namespace?: NamespaceConfig
  /** Connection pool settings */
  connectionPool?: {
    maxConnections: number
    idleTimeout: number
    keepAlive: boolean
  }
}

export interface HatagoConfig {
  /** MCP proxy configuration */
  proxy?: ProxyConfig
  /** Server configuration */
  server?: {
    /** Server port (default: 8787) */
    port?: number
    /** Server hostname (default: 'localhost') */
    hostname?: string
    /** Enable CORS (default: true) */
    cors?: boolean
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number
  }
  /** Logging configuration */
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error'
    format: 'json' | 'pretty'
    output: 'console' | 'file' | 'both'
    file?: string
  }
  /** Security settings */
  security?: {
    /** Require authentication for MCP endpoint */
    requireAuth?: boolean
    /** Allowed origins for CORS */
    allowedOrigins?: string[]
    /** Rate limiting */
    rateLimit?: {
      enabled: boolean
      windowMs: number
      maxRequests: number
    }
  }
}

/** Tool mapping information */
export interface ToolMappingInfo {
  /** Original tool name */
  original: string
  /** Mapped tool name (with namespace) */
  mapped: string
  /** Applied namespace */
  namespace: string
  /** Source server ID */
  server: string
  /** Tool metadata */
  metadata?: {
    title?: string
    description?: string
    category?: string
    version?: string
  }
}

/** Namespace conflict information */
export interface NamespaceConflict {
  /** Conflicting tool name */
  toolName: string
  /** Existing mapping */
  existing: ToolMappingInfo
  /** New mapping attempt */
  attempted: ToolMappingInfo
  /** Suggested resolution */
  suggestion?: string
}