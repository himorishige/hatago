/**
 * Origin validation for MCP Streamable HTTP transport
 * Implements security best practices from MCP specification
 */

import { createDefaultLogger } from '../logger/index.js'

const logger = createDefaultLogger('origin-validation')

export interface OriginValidationConfig {
  /** Enable origin validation (default: true) */
  enabled: boolean

  /** Allowed origins list */
  allowedOrigins: string[]

  /** Allow localhost origins (default: true for development) */
  allowLocalhost: boolean

  /** Strict mode - reject if no Origin header (default: false) */
  strict: boolean

  /** DNS rebinding protection (default: true) */
  dnsRebindingProtection: boolean

  /** Allowed hosts for DNS rebinding protection */
  allowedHosts: string[]
}

/**
 * Default origin validation for development
 */
export const defaultOriginConfig: OriginValidationConfig = {
  enabled: true,
  allowedOrigins: ['*'],
  allowLocalhost: true,
  strict: false,
  dnsRebindingProtection: false,
  allowedHosts: ['localhost', '127.0.0.1', '::1'],
}

/**
 * Strict origin validation for production
 */
export const strictOriginConfig: OriginValidationConfig = {
  enabled: true,
  allowedOrigins: [], // Must be explicitly configured
  allowLocalhost: false,
  strict: true,
  dnsRebindingProtection: true,
  allowedHosts: ['localhost', '127.0.0.1'],
}

/**
 * Validate request origin
 */
export function validateOrigin(
  request: Request,
  config: OriginValidationConfig
): { valid: boolean; reason?: string } {
  if (!config.enabled) {
    return { valid: true }
  }

  const origin = request.headers.get('Origin')
  const host = request.headers.get('Host')

  // DNS rebinding protection
  if (config.dnsRebindingProtection && host) {
    const hostname = host.split(':')[0]
    if (hostname && !config.allowedHosts.includes(hostname)) {
      logger.warn('DNS rebinding attack detected', { host, allowedHosts: config.allowedHosts })
      return { valid: false, reason: `Host not allowed: ${hostname}` }
    }
  }

  // Check if Origin header is present
  if (!origin) {
    if (config.strict) {
      logger.warn('No Origin header in strict mode')
      return { valid: false, reason: 'Origin header required in strict mode' }
    }
    // Allow requests without Origin header in non-strict mode
    return { valid: true }
  }

  // Allow wildcard
  if (config.allowedOrigins.includes('*')) {
    return { valid: true }
  }

  // Check if origin is in allowed list
  if (config.allowedOrigins.includes(origin)) {
    return { valid: true }
  }

  // Check localhost if enabled
  if (config.allowLocalhost) {
    try {
      const url = new URL(origin)
      if (
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '::1' ||
        url.hostname.endsWith('.localhost')
      ) {
        return { valid: true }
      }
    } catch {
      // Invalid URL, will be rejected below
    }
  }

  logger.warn('Origin validation failed', { origin, allowedOrigins: config.allowedOrigins })
  return { valid: false, reason: `Origin not allowed: ${origin}` }
}

/**
 * Create origin validation middleware
 */
export function createOriginValidator(config: OriginValidationConfig) {
  return (request: Request): Response | null => {
    const validation = validateOrigin(request, config)

    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: validation.reason || 'Origin validation failed',
          },
          id: null,
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    }

    return null // Continue processing
  }
}

/**
 * Check if URL is a local/private address
 */
export function isLocalAddress(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname

    // Localhost variations
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    ) {
      return true
    }

    // Private IP ranges
    const parts = hostname.split('.')
    if (parts.length === 4) {
      const first = Number.parseInt(parts[0] || '0', 10)
      const second = Number.parseInt(parts[1] || '0', 10)

      // 10.0.0.0/8
      if (first === 10) return true

      // 172.16.0.0/12
      if (first === 172 && second >= 16 && second <= 31) return true

      // 192.168.0.0/16
      if (first === 192 && second === 168) return true
    }

    return false
  } catch {
    return false
  }
}
