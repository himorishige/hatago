/**
 * Hatago Authentication POC
 *
 * This is a proof of concept for integrating OAuth authentication
 * with MCP servers running in Cloudflare Containers
 */

import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { StdioBridge } from './containers/stdio-bridge.js'
import { DefaultHandler } from './handlers/default-handler.js'
import { MCPApiHandler } from './handlers/mcp-handler.js'
import type { Env } from './types.js'

// Export the StdioBridge container for Durable Objects
export { StdioBridge }

// Create the OAuth provider with MCP server
export default new OAuthProvider<Env>({
  // MCP endpoints with proper WorkerEntrypoint handlers
  apiHandlers: {
    '/mcp': MCPApiHandler,
    '/sse': MCPApiHandler, // Both endpoints use the same handler
  },

  // Authentication handler using WorkerEntrypoint
  defaultHandler: DefaultHandler,

  // OAuth endpoints
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',

  // Access token TTL (1 hour)
  accessTokenTTL: 3600,

  // Support PKCE for security
  allowImplicitFlow: false,

  // Allow public clients for MCP usage
  disallowPublicClientRegistration: false,

  // Supported scopes
  scopesSupported: ['read', 'write', 'execute', 'admin'],

  // Token exchange callback to set props
  tokenExchangeCallback: async options => {
    // For mock auth, keep the existing props from the authorization
    // The props were already set in completeAuthorization
    if (options.grantType === 'authorization_code') {
      // Keep existing props but ensure userId is set
      return {
        newProps: {
          ...options.props,
          userId: options.userId,
        },
      }
    }
    // For refresh token, keep existing props
    return undefined
  },
})
