import { helloHatago } from '@hatago/plugin-hello-hatago'
import { oauthMetadata } from '@hatago/plugin-oauth-metadata'
import { enhancedMcpProxy } from './enhanced-mcp-proxy.js'
import { githubOAuthTestPlugin } from './github-oauth-test.js'

// Environment variables with defaults
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true'
const AUTH_ISSUER = process.env.AUTH_ISSUER || 'https://accounts.example.com'
const RESOURCE = process.env.RESOURCE // Let the plugin derive from request if not set

export const defaultPlugins = [
  // stream "Hello Hatago" - from external package
  helloHatago(),
  // publish OAuth PRM - from external package
  oauthMetadata({
    issuer: AUTH_ISSUER,
    resource: RESOURCE,
    requireAuth: REQUIRE_AUTH,
  }),
  // Enhanced MCP Proxy - internal implementation (uses hatago.config.json)
  enhancedMcpProxy({
    useConfig: true, // Load from hatago.config.json
  }),
  // GitHub OAuth Test Plugin - internal implementation (test/demo purpose)
  githubOAuthTestPlugin,
]
