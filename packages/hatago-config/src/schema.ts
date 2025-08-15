import { z } from 'zod'

/**
 * Authentication configuration schema
 */
const AuthConfigSchema = z.object({
  type: z.enum(['bearer', 'basic', 'custom']),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  headers: z.record(z.string()).optional(),
})

/**
 * Tool mapping configuration schema
 */
const ToolMappingSchema = z.object({
  rename: z.record(z.string()).optional().describe('Rename tools from original name to new name'),
  exclude: z.array(z.string()).optional().describe('Exclude specific tools (supports wildcards)'),
  include: z
    .array(z.string())
    .optional()
    .describe('Include only specific tools (supports wildcards)'),
})

/**
 * Health check configuration schema
 */
const HealthCheckSchema = z.object({
  enabled: z.boolean().default(true),
  interval: z.number().min(1000).default(30000).describe('Health check interval in milliseconds'),
  timeout: z.number().min(100).default(5000).describe('Health check timeout in milliseconds'),
})

/**
 * Retry configuration schema
 */
const RetryConfigSchema = z.object({
  attempts: z.number().min(1).max(10).default(3),
  delay: z.number().min(100).default(1000).describe('Initial delay in milliseconds'),
  backoff: z.enum(['linear', 'exponential']).default('exponential'),
})

/**
 * MCP Server configuration schema
 */
const MCPServerConfigSchema = z.object({
  id: z.string().min(1).describe('Unique server identifier'),
  endpoint: z.string().url().describe('MCP server endpoint URL'),
  namespace: z.string().min(1).optional().describe('Custom namespace (defaults to id)'),
  description: z.string().optional(),
  auth: AuthConfigSchema.optional(),
  tools: ToolMappingSchema.optional(),
  timeout: z.number().min(1000).default(30000).describe('Request timeout in milliseconds'),
  retry: RetryConfigSchema.optional(),
  healthCheck: HealthCheckSchema.optional(),
})

/**
 * Namespace configuration schema
 */
const NamespaceConfigSchema = z.object({
  separator: z.string().length(1).default(':').describe('Namespace separator character'),
  caseSensitive: z.boolean().default(false),
  maxLength: z.number().min(1).default(64).describe('Maximum tool name length'),
  autoPrefix: z
    .object({
      enabled: z.boolean().default(false),
      format: z.string().default('{server}_{index}').describe('Auto-generated prefix format'),
    })
    .optional(),
  versioning: z
    .object({
      enabled: z.boolean().default(false),
      strategy: z.enum(['semver', 'date', 'custom']).default('semver'),
      fallback: z.string().default('latest'),
    })
    .optional(),
})

/**
 * Connection pool configuration schema
 */
const ConnectionPoolSchema = z.object({
  maxConnections: z.number().min(1).default(10),
  idleTimeout: z.number().min(1000).default(30000).describe('Idle timeout in milliseconds'),
  keepAlive: z.boolean().default(true),
})

/**
 * Proxy configuration schema
 */
const ProxyConfigSchema = z.object({
  servers: z.array(MCPServerConfigSchema).default([]),
  namespaceStrategy: z.enum(['prefix', 'suffix', 'custom']).default('prefix'),
  conflictResolution: z.enum(['error', 'rename', 'skip']).default('error'),
  namespace: NamespaceConfigSchema.optional(),
  connectionPool: ConnectionPoolSchema.optional(),
})

/**
 * Server configuration schema
 */
const ServerConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(8787),
  hostname: z.string().default('localhost'),
  cors: z.boolean().default(true),
  timeout: z.number().min(1000).default(30000).describe('Request timeout in milliseconds'),
})

/**
 * Logging configuration schema
 */
const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['json', 'pretty']).default('pretty'),
  output: z.enum(['console', 'file', 'both']).default('console'),
  file: z.string().optional().describe('Log file path (when output includes file)'),
})

/**
 * Rate limiting configuration schema
 */
const RateLimitSchema = z.object({
  enabled: z.boolean().default(false),
  windowMs: z.number().min(1000).default(60000).describe('Time window in milliseconds'),
  maxRequests: z.number().min(1).default(100).describe('Maximum requests per window'),
})

/**
 * Security configuration schema
 */
const SecurityConfigSchema = z.object({
  requireAuth: z.boolean().default(false),
  allowedOrigins: z.array(z.string()).default(['*']),
  rateLimit: RateLimitSchema.optional(),
})

/**
 * Main Hatago configuration schema
 */
export const HatagoConfigSchema = z
  .object({
    $schema: z.string().optional().describe('JSON schema reference'),
    proxy: ProxyConfigSchema.optional(),
    server: ServerConfigSchema.optional(),
    logging: LoggingConfigSchema.optional(),
    security: SecurityConfigSchema.optional(),
  })
  .strict()

// Export individual schemas for reuse
export {
  AuthConfigSchema,
  ToolMappingSchema,
  HealthCheckSchema,
  RetryConfigSchema,
  MCPServerConfigSchema,
  NamespaceConfigSchema,
  ConnectionPoolSchema,
  ProxyConfigSchema,
  ServerConfigSchema,
  LoggingConfigSchema,
  RateLimitSchema,
  SecurityConfigSchema,
}

// Export inferred types
export type HatagoConfig = z.infer<typeof HatagoConfigSchema>
export type AuthConfig = z.infer<typeof AuthConfigSchema>
export type ToolMapping = z.infer<typeof ToolMappingSchema>
export type HealthCheckConfig = z.infer<typeof HealthCheckSchema>
export type RetryConfig = z.infer<typeof RetryConfigSchema>
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>
export type NamespaceConfig = z.infer<typeof NamespaceConfigSchema>
export type ConnectionPoolConfig = z.infer<typeof ConnectionPoolSchema>
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>
export type ServerConfig = z.infer<typeof ServerConfigSchema>
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>
export type RateLimitConfig = z.infer<typeof RateLimitSchema>
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>
