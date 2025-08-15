import helloHatago from './hello-hatago.js'
import oauthMetadata from './oauth-metadata.js'
import mcpProxy from '../../../packages/core/src/plugins/mcp-proxy.js'

// Environment variables with defaults
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true'
const AUTH_ISSUER = process.env.AUTH_ISSUER || 'https://accounts.example.com'
const RESOURCE = process.env.RESOURCE // Let the plugin derive from request if not set

export const defaultPlugins = [
  // stream "Hello Hatago"
  helloHatago(),
  // publish OAuth PRM; auth not enforced by default
  oauthMetadata({
    issuer: AUTH_ISSUER,
    resource: RESOURCE,
    requireAuth: REQUIRE_AUTH,
  }),
  // MCP Proxy - connect to external MCP servers
  mcpProxy({
    server: {
      id: 'clock',
      endpoint: 'http://localhost:8788',
      description: 'External MCP Clock Server providing time and timezone tools',
      // No authentication required for local testing
    }
  }),
]
