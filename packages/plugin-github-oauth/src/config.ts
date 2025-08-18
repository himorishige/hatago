/**
 * Shared GitHub App configuration for Hatago
 * Provides default settings for the Hatago GitHub OAuth App
 */
import type { GitHubDeviceFlowConfig } from './types.js'

/**
 * Hatago shared GitHub OAuth App configuration
 * This allows users to authenticate without creating their own OAuth App
 */
export const HATAGO_GITHUB_CONFIG = {
  // No default client ID - users must provide their own until shared app is created
  CLIENT_ID: undefined,
  SCOPE: 'public_repo read:user',
} as const

/**
 * Type-safe environment variable getter
 * @param env Environment variables object
 * @param key Environment variable key
 * @returns String value or undefined
 */
function getEnvVar(env: Record<string, unknown>, key: string): string | undefined {
  const value = env[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Get GitHub OAuth configuration from environment with fallback to shared app
 * @param env Environment variables from HatagoContext
 * @returns GitHub OAuth configuration
 * @throws Error if GITHUB_CLIENT_ID is not provided
 */
export function getGitHubConfig(env: Record<string, unknown> = {}): GitHubDeviceFlowConfig {
  // Use custom client ID if provided, otherwise use shared Hatago app
  const clientId = getEnvVar(env, 'GITHUB_CLIENT_ID') || HATAGO_GITHUB_CONFIG.CLIENT_ID
  const clientSecret = getEnvVar(env, 'GITHUB_CLIENT_SECRET') // Optional for device flow
  const scope = getEnvVar(env, 'GITHUB_OAUTH_SCOPE') || HATAGO_GITHUB_CONFIG.SCOPE

  if (!clientId) {
    throw new Error(
      'GitHub Client ID is required. Please set GITHUB_CLIENT_ID environment variable.\n' +
        'To create a GitHub OAuth App:\n' +
        '1. Go to https://github.com/settings/applications/new\n' +
        '2. Set Application name: "Hatago MCP Server"\n' +
        '3. Set Homepage URL: http://localhost:8787\n' +
        '4. Set Authorization callback URL: http://localhost:8787\n' +
        '5. Copy the Client ID and set GITHUB_CLIENT_ID=your_client_id'
    )
  }

  return {
    clientId,
    clientSecret,
    scope,
    sessionTTL: 900, // 15 minutes
    idleTimeout: 300, // 5 minutes
  }
}

/**
 * Check if using shared Hatago GitHub App
 * @param config GitHub configuration
 * @returns true if using shared app, false if using custom app
 */
export function isUsingSharedApp(_config: GitHubDeviceFlowConfig): boolean {
  // Since shared app is not yet available, always return false
  return false
}

/**
 * Get setup instructions based on configuration
 * @param config GitHub configuration
 * @returns Setup instructions for the user
 */
export function getSetupInstructions(config: GitHubDeviceFlowConfig): string[] {
  const hasSecret = !!config.clientSecret
  return [
    `Using GitHub OAuth App: ${config.clientId}`,
    hasSecret
      ? '✓ Client Secret configured'
      : '⚠ Client Secret not configured (token revocation disabled)',
    '',
    'Environment variables:',
    `GITHUB_CLIENT_ID=${config.clientId}`,
    hasSecret ? 'GITHUB_CLIENT_SECRET=***' : 'GITHUB_CLIENT_SECRET=(not set)',
    '',
    'To create a GitHub OAuth App:',
    '1. Go to https://github.com/settings/applications/new',
    '2. Set Application name: "Hatago MCP Server"',
    '3. Set Homepage URL: http://localhost:8787',
    '4. Set Authorization callback URL: http://localhost:8787',
    '5. Copy the Client ID and set GITHUB_CLIENT_ID=your_client_id',
  ]
}
