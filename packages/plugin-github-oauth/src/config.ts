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
  // TODO: Replace with actual Hatago GitHub OAuth App Client ID when created
  CLIENT_ID: 'Ov23liCXXXXXXXXXXXXX', // Placeholder - will be replaced with real App ID
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
 */
export function getGitHubConfig(env: Record<string, unknown> = {}): GitHubDeviceFlowConfig {
  // Use custom client ID if provided, otherwise use shared Hatago app
  const clientId = getEnvVar(env, 'GITHUB_CLIENT_ID') || HATAGO_GITHUB_CONFIG.CLIENT_ID
  const clientSecret = getEnvVar(env, 'GITHUB_CLIENT_SECRET') // Optional for device flow
  const scope = getEnvVar(env, 'GITHUB_OAUTH_SCOPE') || HATAGO_GITHUB_CONFIG.SCOPE

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
export function isUsingSharedApp(config: GitHubDeviceFlowConfig): boolean {
  return config.clientId === HATAGO_GITHUB_CONFIG.CLIENT_ID
}

/**
 * Get setup instructions based on configuration
 * @param config GitHub configuration
 * @returns Setup instructions for the user
 */
export function getSetupInstructions(config: GitHubDeviceFlowConfig): string[] {
  if (isUsingSharedApp(config)) {
    return [
      'Using Hatago shared GitHub App - no setup required!',
      'Just run github_auth_start to begin authentication.',
      '',
      'Note: If you prefer to use your own OAuth App:',
      '1. Create GitHub OAuth App at https://github.com/settings/applications/new',
      '2. Set environment variable: GITHUB_CLIENT_ID=your_client_id',
      '3. Optionally set: GITHUB_CLIENT_SECRET=your_client_secret',
    ]
  }

  const hasSecret = !!config.clientSecret
  return [
    `Using custom GitHub OAuth App: ${config.clientId}`,
    hasSecret
      ? '✓ Client Secret configured'
      : '⚠ Client Secret not configured (token revocation disabled)',
    '',
    'Environment variables:',
    `GITHUB_CLIENT_ID=${config.clientId}`,
    hasSecret ? 'GITHUB_CLIENT_SECRET=***' : 'GITHUB_CLIENT_SECRET=(not set)',
  ]
}
