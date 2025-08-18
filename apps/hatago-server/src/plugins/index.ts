import type { HatagoPlugin } from '@hatago/core'
import { createFetchTool, createSearchTool } from '@hatago/plugin-chatgpt-connector'
import { createGitHubDeviceFlowPlugin, testSharedAppPlugin } from '@hatago/plugin-github-oauth'
import { helloHatago } from '@hatago/plugin-hello-hatago'
import { oauthMetadata } from '@hatago/plugin-oauth-metadata'
import { enhancedMcpProxy } from './enhanced-mcp-proxy.js'
import { createRunnerPlugin } from './runner.js'

/**
 * Create plugins based on environment variables
 * Supports both Node.js (process.env) and Cloudflare Workers (env parameter)
 */
export function createPlugins(env?: Record<string, unknown>): HatagoPlugin[] {
  // Helper function to get environment variable from either source
  // Cloudflare Workers: env parameter
  // Node.js: process.env (fallback)
  const getEnv = (key: string, defaultValue = ''): string => {
    // Priority: env parameter > process.env > default
    if (env?.[key] !== undefined) {
      return String(env[key])
    }
    // Only use process.env in Node.js environment
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key]
    }
    return defaultValue
  }

  // Helper function for optional environment variables
  const getOptionalEnv = (key: string): string | undefined => {
    if (env?.[key] !== undefined) {
      return String(env[key])
    }
    // Only use process.env in Node.js environment
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key]
    }
    return undefined
  }

  // Environment variables with defaults
  const REQUIRE_AUTH = getEnv('REQUIRE_AUTH') === 'true'
  const AUTH_ISSUER = getEnv('AUTH_ISSUER', 'https://accounts.example.com')
  const RESOURCE = getOptionalEnv('RESOURCE') // Let the plugin derive from request if not set

  // Debug auth settings
  console.log('Auth debug:', {
    REQUIRE_AUTH,
    REQUIRE_AUTH_raw: getEnv('REQUIRE_AUTH'),
    AUTH_ISSUER,
    RESOURCE,
  })

  // ChatGPT connector environment variables
  const CHATGPT_MODE = getEnv('CHATGPT_MODE') === 'true'
  const CHATGPT_BASE_URL = getEnv('CHATGPT_BASE_URL', 'https://docs.hatago.dev/')
  const CHATGPT_MAX_RESULTS = Number.parseInt(getEnv('CHATGPT_MAX_RESULTS', '10'), 10)

  // Debug: Log environment variables (remove in production)
  console.log('Plugin environment debug:', {
    CHATGPT_MODE,
    CHATGPT_BASE_URL,
    CHATGPT_MAX_RESULTS,
    envKeys: env ? Object.keys(env) : 'undefined',
    processEnvChatGPT: typeof process !== 'undefined' ? process.env?.CHATGPT_MODE : 'N/A',
  })

  const plugins = [
    // stream "Hello Hatago" - from external package
    helloHatago(),
  ]

  // ChatGPT connector with search and fetch tools - from external package
  if (CHATGPT_MODE) {
    console.log('Adding ChatGPT connector plugin...')
    try {
      const chatGPTConfig = {
        baseUrl: CHATGPT_BASE_URL,
        maxResults: CHATGPT_MAX_RESULTS,
        mockMode: true,
      }
      plugins.push(createSearchTool(chatGPTConfig))
      plugins.push(createFetchTool(chatGPTConfig))
      console.log('ChatGPT connector plugin added successfully')
    } catch (error) {
      console.error('Failed to create ChatGPT connector plugin:', error)
    }
  } else {
    console.log('ChatGPT connector disabled (CHATGPT_MODE=false)')
  }

  plugins.push(
    // publish OAuth PRM - from external package
    oauthMetadata({
      issuer: AUTH_ISSUER,
      resource: RESOURCE,
      requireAuth: REQUIRE_AUTH,
    })
  )

  plugins.push(
    // Enhanced MCP Proxy - internal implementation (uses hatago.config.json)
    enhancedMcpProxy({
      useConfig: true, // Load from hatago.config.json
    })
  )

  // Runner Plugin - manages npx-based MCP servers
  const RUNNER_ENABLED = getEnv('RUNNER_ENABLED', 'true') === 'true'
  const RUNNER_AUTO_START = getEnv('RUNNER_AUTO_START', 'false') === 'true'

  if (RUNNER_ENABLED) {
    console.log('Adding Runner plugin...')
    plugins.push(
      createRunnerPlugin({
        enabled: true,
        autoStart: RUNNER_AUTO_START,
      })
    )
    console.log('Runner plugin added successfully')
  }

  // GitHub OAuth settings
  const GITHUB_CLIENT_ID = getOptionalEnv('GITHUB_CLIENT_ID')
  const GITHUB_CLIENT_SECRET = getOptionalEnv('GITHUB_CLIENT_SECRET')
  const GITHUB_OAUTH_SCOPE = getOptionalEnv('GITHUB_OAUTH_SCOPE')

  // Debug GitHub settings
  console.log('GitHub OAuth debug:', {
    hasClientId: !!GITHUB_CLIENT_ID,
    clientIdPrefix: `${GITHUB_CLIENT_ID?.substring(0, 8)}...`,
    hasClientSecret: !!GITHUB_CLIENT_SECRET,
    scope: GITHUB_OAUTH_SCOPE || 'default: public_repo read:user',
  })

  // Add GitHub OAuth Device Flow plugin if client ID is configured
  if (GITHUB_CLIENT_ID) {
    console.log('Adding GitHub OAuth Device Flow plugin...')
    try {
      plugins.push(
        createGitHubDeviceFlowPlugin({
          clientId: GITHUB_CLIENT_ID,
          clientSecret: GITHUB_CLIENT_SECRET,
          scope: GITHUB_OAUTH_SCOPE || 'public_repo read:user',
        })
      )
      console.log('GitHub OAuth Device Flow plugin added successfully')
    } catch (error) {
      console.error('Failed to create GitHub OAuth Device Flow plugin:', error)
    }
  } else {
    console.log('GitHub OAuth disabled - adding test plugin for shared app demonstration')
    // Add test plugin to demonstrate shared app functionality
    plugins.push(testSharedAppPlugin)
  }

  return plugins
}

// Legacy export for Node.js compatibility
export const defaultPlugins = createPlugins()
