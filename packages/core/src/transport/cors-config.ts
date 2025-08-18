/**
 * CORS configuration for MCP Streamable HTTP transport
 * Based on MCP specification requirements
 */

export interface CorsConfig {
  /** Enable CORS (default: true) */
  enabled: boolean

  /** Allowed origins (default: ['*']) */
  origins: string[] | '*'

  /** Allowed methods (default: ['GET', 'POST', 'DELETE', 'OPTIONS']) */
  methods: string[]

  /** Allowed headers - must include MCP-Session-Id */
  allowedHeaders: string[]

  /** Exposed headers - must include MCP-Session-Id for browser clients */
  exposedHeaders: string[]

  /** Allow credentials (default: false) */
  credentials: boolean

  /** Max age for preflight cache (seconds) */
  maxAge?: number
}

/**
 * Default CORS configuration for MCP compliance
 */
export const defaultCorsConfig: CorsConfig = {
  enabled: true,
  origins: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'MCP-Session-Id',
    'mcp-session-id', // Both cases for compatibility
  ],
  exposedHeaders: ['MCP-Session-Id', 'mcp-session-id'],
  credentials: false,
  maxAge: 86400, // 24 hours
}

/**
 * Strict CORS configuration for production
 */
export const strictCorsConfig: CorsConfig = {
  enabled: true,
  origins: ['https://localhost:3000'], // Must be configured
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'MCP-Session-Id', 'mcp-session-id'],
  exposedHeaders: ['MCP-Session-Id', 'mcp-session-id'],
  credentials: true,
  maxAge: 3600, // 1 hour
}

/**
 * Apply CORS headers to response
 */
export function applyCorsHeaders(request: Request, response: Response, config: CorsConfig): void {
  if (!config.enabled) return

  const origin = request.headers.get('Origin')

  // Handle origin
  if (config.origins === '*') {
    response.headers.set('Access-Control-Allow-Origin', '*')
  } else if (origin && config.origins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }

  // Set other CORS headers
  response.headers.set('Access-Control-Allow-Methods', config.methods.join(', '))
  response.headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '))
  response.headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))

  if (config.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }

  if (config.maxAge !== undefined) {
    response.headers.set('Access-Control-Max-Age', String(config.maxAge))
  }
}

/**
 * Validate origin against allowed origins
 */
export function isOriginAllowed(origin: string | null, config: CorsConfig): boolean {
  if (!config.enabled) return true
  if (!origin) return false
  if (config.origins === '*') return true
  return config.origins.includes(origin)
}
