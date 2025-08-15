import type { HatagoPlugin } from '../system/types.js'

type Options = {
  /**
   * Authorization Server issuer URL (RFC 8414). Example: https://accounts.example.com
   * If omitted, only PRM (.well-known/oauth-protected-resource) is served and
   * WWW-Authenticate will include that location.
   */
  issuer?: string
  /**
   * Resource identifier URL (RFC 8707). By default we derive from request URL.
   */
  resource?: string
  /**
   * Whether to enforce Bearer auth on /mcp endpoints. If true and no/invalid token,
   * responds with 401 and WWW-Authenticate containing resource_metadata.
   */
  requireAuth?: boolean
  /**
   * Scopes that this RS recognizes.
   */
  scopes?: string[]
}

export const oauthMetadata =
  (opts: Options = {}): HatagoPlugin =>
  ({ app, getBaseUrl, mode }) => {
    const scopes = opts.scopes ?? ['mcp:read', 'mcp:invoke']

    // Only register HTTP routes in http mode
    if (app && mode === 'http') {
      // Protected Resource Metadata (RFC 9728)
      app.get('/.well-known/oauth-protected-resource', c => {
        const base = opts.resource ? new URL(opts.resource) : getBaseUrl(c.req.raw)
        const body = {
          resource: base.origin, // resource identifier
          ...(opts.issuer ? { authorization_servers: [opts.issuer] } : {}),
          scopes_supported: scopes,
          bearer_methods_supported: ['header'],
          resource_name: 'Hatago MCP',
          resource_documentation: new URL('/docs', base.origin).toString(),
        }
        return c.json(body)
      })

      // Optional: advertise AS metadata URL for convenience
      if (opts.issuer) {
        app.get('/.well-known/oauth-authorization-server', c => {
          // Minimal RFC 8414 doc that points toward the issuer
          return c.json({
            issuer: opts.issuer,
            authorization_endpoint: new URL('/authorize', opts.issuer).toString(),
            token_endpoint: new URL('/token', opts.issuer).toString(),
            jwks_uri: new URL('/.well-known/jwks.json', opts.issuer).toString(),
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
          })
        })
      }

      // If enabled, gate /mcp* with a simple Bearer check and provide resource_metadata hint
      if (opts.requireAuth) {
        app.use('/mcp', async (c, next) => {
          const auth = c.req.header('authorization') || ''
          const hasBearer = /^Bearer\s+.+/i.test(auth)
          if (!hasBearer) {
            const base = opts.resource ? new URL(opts.resource) : getBaseUrl(c.req.raw)
            c.header(
              'WWW-Authenticate',
              `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource', base.origin).toString()}"`
            )
            return c.body(null, 401)
          }
          await next()
        })
      }
    }
  }

export default oauthMetadata
