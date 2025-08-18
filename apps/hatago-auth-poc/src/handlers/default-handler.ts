/**
 * Default Handler using WorkerEntrypoint
 *
 * This handler processes all non-API requests and authentication flows
 */

import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Env } from '../types.js'

export class DefaultHandler extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Route to appropriate auth handler based on AUTH_TYPE
    switch (this.env.AUTH_TYPE) {
      case 'mock':
        return this.handleMockAuth(request, url)
      case 'cloudflare-access':
        return this.handleCloudflareAccess(request, url)
      case 'github':
        return this.handleGitHubOAuth(request, url)
      default:
        return this.handleMockAuth(request, url)
    }
  }

  /**
   * Mock authentication handler for development
   */
  private async handleMockAuth(request: Request, url: URL): Promise<Response> {
    // Use OAuthProvider helpers for proper OAuth flow
    const oauthProvider = this.env.OAUTH_PROVIDER

    if (url.pathname === '/authorize') {
      try {
        // Parse the OAuth authorization request
        const authRequest = await oauthProvider.parseAuthRequest(request)

        // Check if client exists
        const client = await oauthProvider.lookupClient(authRequest.clientId)
        if (!client) {
          return new Response('Invalid client_id', { status: 400 })
        }

        // Validate redirect URI
        if (!client.redirectUris.includes(authRequest.redirectUri)) {
          return new Response('Invalid redirect_uri', { status: 400 })
        }

        // Store auth request in session for callback
        const sessionId = crypto.randomUUID()
        await this.env.OAUTH_KV.put(
          `auth_session_${sessionId}`,
          JSON.stringify(authRequest),
          { expirationTtl: 600 } // 10 minutes
        )

        // Return mock login page
        return new Response(
          `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Mock Login - Hatago Auth POC</title>
              <style>
                body { font-family: system-ui; padding: 2rem; max-width: 400px; margin: 0 auto; }
                h1 { color: #333; }
                form { display: flex; flex-direction: column; gap: 1rem; }
                input, button { padding: 0.5rem; font-size: 1rem; }
                button { background: #0066cc; color: white; border: none; cursor: pointer; }
                button:hover { background: #0052a3; }
                .info { background: #f0f0f0; padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
              </style>
            </head>
            <body>
              <h1>Mock Login</h1>
              <div class="info">
                <p><strong>Client:</strong> ${client.clientName || authRequest.clientId}</p>
                <p><strong>Requested Scopes:</strong> ${authRequest.scope.join(', ') || 'none'}</p>
              </div>
              <p>This is a development-only mock authentication.</p>
              <form method="GET" action="${url.origin}/authorize/callback">
                <input type="hidden" name="session" value="${sessionId}">
                <input type="email" name="email" placeholder="Email" value="test@example.com" required>
                <input type="text" name="name" placeholder="Name" value="Test User">
                <button type="submit">Login & Authorize</button>
              </form>
            </body>
          </html>
        `,
          {
            headers: { 'Content-Type': 'text/html' },
          }
        )
      } catch (error) {
        console.error('Auth request parse error:', error)
        return new Response('Invalid authorization request', { status: 400 })
      }
    }

    if (url.pathname === '/authorize/callback') {
      // Mock callback - complete the authorization
      const sessionId = url.searchParams.get('session')
      const email = url.searchParams.get('email')
      const name = url.searchParams.get('name')

      if (!sessionId || !email) {
        return new Response('Missing required parameters', { status: 400 })
      }

      // Retrieve the original auth request
      const sessionData = await this.env.OAUTH_KV.get(`auth_session_${sessionId}`)
      if (!sessionData) {
        return new Response('Session expired or invalid', { status: 400 })
      }

      const authRequest = JSON.parse(sessionData)

      // Complete the authorization using OAuthProvider helper
      // Grant execute permission to admin users
      const permissions =
        email === 'admin@example.com' ? ['read', 'write', 'execute'] : ['read', 'write']

      const result = await oauthProvider.completeAuthorization({
        request: authRequest,
        userId: email, // Use email as user ID for mock
        metadata: {
          authorizedAt: new Date().toISOString(),
        },
        scope: authRequest.scope || ['read'], // Grant requested scopes
        props: {
          userId: email,
          email,
          name: name || 'Test User',
          permissions,
          groups: email === 'admin@example.com' ? ['users', 'admins'] : ['users'],
        },
      })

      // Clean up session
      await this.env.OAUTH_KV.delete(`auth_session_${sessionId}`)

      // Redirect to client with authorization code
      return Response.redirect(result.redirectTo, 302)
    }

    // Default response for other paths
    return new Response('Not Found', { status: 404 })
  }

  /**
   * Cloudflare Access handler
   */
  private async handleCloudflareAccess(_request: Request, _url: URL): Promise<Response> {
    // This would integrate with Cloudflare Access
    // For now, return a placeholder
    return new Response('Cloudflare Access integration not yet implemented', {
      status: 501,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  /**
   * GitHub OAuth handler
   */
  private async handleGitHubOAuth(_request: Request, _url: URL): Promise<Response> {
    // This would integrate with GitHub OAuth
    // For now, return a placeholder
    return new Response('GitHub OAuth integration not yet implemented', {
      status: 501,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
