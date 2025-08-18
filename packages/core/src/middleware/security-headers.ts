/**
 * Security headers middleware for MCP servers
 * Implements security best practices as recommended by OWASP
 */
import type { Context, Next } from 'hono'

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  /** Enable Content Security Policy (default: true) */
  contentSecurityPolicy?: boolean
  /** Custom CSP directives (default: secure defaults) */
  cspDirectives?: string
  /** Enable X-Frame-Options (default: true) */
  frameOptions?: boolean
  /** X-Frame-Options value (default: 'DENY') */
  frameOptionsValue?: 'DENY' | 'SAMEORIGIN'
  /** Enable X-Content-Type-Options (default: true) */
  contentTypeOptions?: boolean
  /** Enable Referrer-Policy (default: true) */
  referrerPolicy?: boolean
  /** Referrer policy value (default: 'strict-origin-when-cross-origin') */
  referrerPolicyValue?: string
  /** Enable Strict-Transport-Security (default: true) */
  strictTransportSecurity?: boolean
  /** HSTS max-age in seconds (default: 31536000 = 1 year) */
  hstsMaxAge?: number
  /** Include HSTS subdomains (default: true) */
  hstsIncludeSubDomains?: boolean
  /** Enable X-Permitted-Cross-Domain-Policies (default: true) */
  crossDomainPolicies?: boolean
  /** Enable cache control headers for security (default: true) */
  cacheControl?: boolean
}

/**
 * Default secure CSP directives for MCP servers
 */
const DEFAULT_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "child-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "manifest-src 'none'",
].join('; ')

/**
 * Security headers middleware factory
 * @param config Security headers configuration
 * @returns Hono middleware function
 */
export function securityHeaders(config: SecurityHeadersConfig = {}) {
  const {
    contentSecurityPolicy = true,
    cspDirectives = DEFAULT_CSP_DIRECTIVES,
    frameOptions = true,
    frameOptionsValue = 'DENY',
    contentTypeOptions = true,
    referrerPolicy = true,
    referrerPolicyValue = 'strict-origin-when-cross-origin',
    strictTransportSecurity = true,
    hstsMaxAge = 31536000, // 1 year
    hstsIncludeSubDomains = true,
    crossDomainPolicies = true,
    cacheControl = true,
  } = config

  return async (c: Context, next: Next) => {
    // Content Security Policy
    if (contentSecurityPolicy) {
      c.header('Content-Security-Policy', cspDirectives)
    }

    // X-Frame-Options - prevent clickjacking
    if (frameOptions) {
      c.header('X-Frame-Options', frameOptionsValue)
    }

    // X-Content-Type-Options - prevent MIME type sniffing
    if (contentTypeOptions) {
      c.header('X-Content-Type-Options', 'nosniff')
    }

    // Referrer-Policy - control referrer information
    if (referrerPolicy) {
      c.header('Referrer-Policy', referrerPolicyValue)
    }

    // Strict-Transport-Security - enforce HTTPS
    if (strictTransportSecurity) {
      const hstsValue = `max-age=${hstsMaxAge}${hstsIncludeSubDomains ? '; includeSubDomains' : ''}`
      c.header('Strict-Transport-Security', hstsValue)
    }

    // X-Permitted-Cross-Domain-Policies - disable Adobe Flash/PDF cross-domain requests
    if (crossDomainPolicies) {
      c.header('X-Permitted-Cross-Domain-Policies', 'none')
    }

    // Cache control for security-sensitive responses
    if (cacheControl) {
      // Prevent caching of potentially sensitive data
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      c.header('Pragma', 'no-cache')
      c.header('Expires', '0')
      c.header('Surrogate-Control', 'no-store')
    }

    // X-DNS-Prefetch-Control - disable DNS prefetching for privacy
    c.header('X-DNS-Prefetch-Control', 'off')

    // Permissions-Policy - disable unnecessary browser features
    c.header(
      'Permissions-Policy',
      [
        'accelerometer=()',
        'camera=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'payment=()',
        'usb=()',
      ].join(', ')
    )

    await next()
  }
}

/**
 * MCP-specific security headers middleware
 * Optimized for MCP server security requirements
 */
export function mcpSecurityHeaders() {
  return securityHeaders({
    // MCP servers should be very restrictive
    contentSecurityPolicy: true,
    cspDirectives: [
      "default-src 'none'",
      "script-src 'none'",
      "style-src 'none'",
      "img-src 'none'",
      "font-src 'none'",
      "connect-src 'self'",
      "media-src 'none'",
      "object-src 'none'",
      "child-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "manifest-src 'none'",
    ].join('; '),
    frameOptions: true,
    frameOptionsValue: 'DENY',
    contentTypeOptions: true,
    referrerPolicy: true,
    referrerPolicyValue: 'no-referrer',
    strictTransportSecurity: true,
    hstsMaxAge: 31536000,
    hstsIncludeSubDomains: true,
    crossDomainPolicies: true,
    cacheControl: true,
  })
}
