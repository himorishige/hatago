import { Hono } from 'hono'
/**
 * Security headers middleware tests
 * Tests OWASP-recommended security headers implementation
 */
import { describe, expect, it } from 'vitest'
import { mcpSecurityHeaders, securityHeaders } from '../../src/middleware/security-headers.js'

describe('Security Headers Middleware', () => {
  describe('securityHeaders with default config', () => {
    it('should set all default security headers', async () => {
      const app = new Hono()
      app.use('*', securityHeaders())
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      // Content Security Policy
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
      expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'")
      expect(response.headers.get('Content-Security-Policy')).toContain("object-src 'none'")

      // Frame protection
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')

      // MIME type protection
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')

      // Referrer policy
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')

      // HSTS
      expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
      expect(response.headers.get('Strict-Transport-Security')).toContain('includeSubDomains')

      // Cross-domain policies
      expect(response.headers.get('X-Permitted-Cross-Domain-Policies')).toBe('none')

      // Cache control
      expect(response.headers.get('Cache-Control')).toContain('no-store')
      expect(response.headers.get('Cache-Control')).toContain('no-cache')
      expect(response.headers.get('Pragma')).toBe('no-cache')
      expect(response.headers.get('Expires')).toBe('0')

      // Privacy headers
      expect(response.headers.get('X-DNS-Prefetch-Control')).toBe('off')

      // Permissions policy
      const permissionsPolicy = response.headers.get('Permissions-Policy')
      expect(permissionsPolicy).toContain('camera=()')
      expect(permissionsPolicy).toContain('microphone=()')
      expect(permissionsPolicy).toContain('geolocation=()')
    })

    it('should allow custom CSP directives', async () => {
      const app = new Hono()
      app.use(
        '*',
        securityHeaders({
          cspDirectives: "default-src 'none'; connect-src 'self'",
        })
      )
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      expect(response.headers.get('Content-Security-Policy')).toBe(
        "default-src 'none'; connect-src 'self'"
      )
    })

    it('should allow disabling specific headers', async () => {
      const app = new Hono()
      app.use(
        '*',
        securityHeaders({
          contentSecurityPolicy: false,
          frameOptions: false,
          strictTransportSecurity: false,
        })
      )
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      expect(response.headers.get('Content-Security-Policy')).toBeNull()
      expect(response.headers.get('X-Frame-Options')).toBeNull()
      expect(response.headers.get('Strict-Transport-Security')).toBeNull()

      // Other headers should still be present
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    it('should allow custom HSTS configuration', async () => {
      const app = new Hono()
      app.use(
        '*',
        securityHeaders({
          hstsMaxAge: 86400, // 1 day
          hstsIncludeSubDomains: false,
        })
      )
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      const hsts = response.headers.get('Strict-Transport-Security')
      expect(hsts).toBe('max-age=86400')
      expect(hsts).not.toContain('includeSubDomains')
    })

    it('should allow SAMEORIGIN frame options', async () => {
      const app = new Hono()
      app.use(
        '*',
        securityHeaders({
          frameOptionsValue: 'SAMEORIGIN',
        })
      )
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    })
  })

  describe('mcpSecurityHeaders for MCP servers', () => {
    it('should set restrictive CSP for MCP servers', async () => {
      const app = new Hono()
      app.use('*', mcpSecurityHeaders())
      app.get('/mcp', c => c.text('mcp response'))

      const response = await app.request('/mcp')

      // Very restrictive CSP for MCP
      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toContain("default-src 'none'")
      expect(csp).toContain("script-src 'none'")
      expect(csp).toContain("style-src 'none'")
      expect(csp).toContain("connect-src 'self'") // Only self connections allowed
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("form-action 'none'")

      // Strict frame protection
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')

      // No referrer for privacy
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')

      // All other security headers should be present
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
      expect(response.headers.get('Cache-Control')).toContain('no-store')
    })

    it('should prevent content loading in MCP responses', async () => {
      const app = new Hono()
      app.use('*', mcpSecurityHeaders())
      app.get('/mcp', c => c.text('mcp response'))

      const response = await app.request('/mcp')

      const csp = response.headers.get('Content-Security-Policy')

      // No images, media, objects, etc.
      expect(csp).toContain("img-src 'none'")
      expect(csp).toContain("media-src 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("child-src 'none'")
      expect(csp).toContain("frame-src 'none'")
      expect(csp).toContain("worker-src 'none'")
      expect(csp).toContain("manifest-src 'none'")
    })
  })

  describe('XSS Protection', () => {
    it('should prevent inline script execution', async () => {
      const app = new Hono()
      app.use('*', mcpSecurityHeaders())
      app.get('/test', c => {
        // Try to inject script
        return c.html('<script>alert("xss")</script><p>content</p>')
      })

      const response = await app.request('/test')

      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toContain("script-src 'none'")

      // Content should be served but script won't execute due to CSP
      const body = await response.text()
      expect(body).toContain('<script>')
      expect(body).toContain('<p>content</p>')
    })

    it('should prevent MIME type sniffing attacks', async () => {
      const app = new Hono()
      app.use('*', securityHeaders())
      app.get('/test', c => {
        // Malicious content that could be sniffed as script
        return c.text('/*<script>alert("xss")</script>*/', 200, {
          'Content-Type': 'text/plain',
        })
      })

      const response = await app.request('/test')

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Content-Type')).toBe('text/plain')
    })
  })

  describe('Clickjacking Protection', () => {
    it('should prevent framing with DENY', async () => {
      const app = new Hono()
      app.use('*', securityHeaders({ frameOptionsValue: 'DENY' }))
      app.get('/test', c => c.html('<h1>Protected Content</h1>'))

      const response = await app.request('/test')

      expect(response.headers.get('X-Frame-Options')).toBe('DENY')

      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toContain("frame-ancestors 'none'")
    })

    it('should allow same-origin framing when configured', async () => {
      const app = new Hono()
      app.use(
        '*',
        securityHeaders({
          frameOptionsValue: 'SAMEORIGIN',
          cspDirectives: "default-src 'self'; frame-ancestors 'self'",
        })
      )
      app.get('/test', c => c.html('<h1>Content</h1>'))

      const response = await app.request('/test')

      expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
      expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'")
    })
  })

  describe('Privacy Protection', () => {
    it('should control referrer information', async () => {
      const app = new Hono()
      app.use(
        '*',
        securityHeaders({
          referrerPolicyValue: 'no-referrer',
        })
      )
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    })

    it('should disable DNS prefetching', async () => {
      const app = new Hono()
      app.use('*', securityHeaders())
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      expect(response.headers.get('X-DNS-Prefetch-Control')).toBe('off')
    })

    it('should disable browser features via permissions policy', async () => {
      const app = new Hono()
      app.use('*', securityHeaders())
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      const permissionsPolicy = response.headers.get('Permissions-Policy')
      expect(permissionsPolicy).toContain('camera=()')
      expect(permissionsPolicy).toContain('microphone=()')
      expect(permissionsPolicy).toContain('geolocation=()')
      expect(permissionsPolicy).toContain('payment=()')
    })
  })

  describe('Cache Security', () => {
    it('should prevent caching of sensitive responses', async () => {
      const app = new Hono()
      app.use('*', securityHeaders())
      app.get('/sensitive', c => c.json({ secret: 'data' }))

      const response = await app.request('/sensitive')

      expect(response.headers.get('Cache-Control')).toContain('no-store')
      expect(response.headers.get('Cache-Control')).toContain('no-cache')
      expect(response.headers.get('Cache-Control')).toContain('must-revalidate')
      expect(response.headers.get('Pragma')).toBe('no-cache')
      expect(response.headers.get('Expires')).toBe('0')
      expect(response.headers.get('Surrogate-Control')).toBe('no-store')
    })

    it('should allow disabling cache control headers', async () => {
      const app = new Hono()
      app.use('*', securityHeaders({ cacheControl: false }))
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      expect(response.headers.get('Cache-Control')).toBeNull()
      expect(response.headers.get('Pragma')).toBeNull()
      expect(response.headers.get('Expires')).toBeNull()
    })
  })

  describe('HTTPS Enforcement', () => {
    it('should set HSTS with includeSubDomains by default', async () => {
      const app = new Hono()
      app.use('*', securityHeaders())
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      const hsts = response.headers.get('Strict-Transport-Security')
      expect(hsts).toContain('max-age=31536000')
      expect(hsts).toContain('includeSubDomains')
    })

    it('should allow custom HSTS configuration', async () => {
      const app = new Hono()
      app.use(
        '*',
        securityHeaders({
          hstsMaxAge: 604800, // 1 week
          hstsIncludeSubDomains: false,
        })
      )
      app.get('/test', c => c.text('test'))

      const response = await app.request('/test')

      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=604800')
    })
  })
})
