import { createDefaultLogger } from '@hatago/core'
/**
 * GitHub OAuth device flow implementation
 * Handles device code requests and token polling
 */
import type { AccessTokenResponse, DeviceCodeResponse, GitHubToken, GitHubUser } from './types.js'

const logger = createDefaultLogger('github-device-flow')

/**
 * Request a device code from GitHub
 * @param clientId GitHub OAuth App client ID
 * @param scope OAuth scopes to request
 * @returns Device code response
 */
export async function requestDeviceCode(
  clientId: string,
  scope?: string
): Promise<DeviceCodeResponse> {
  logger.debug('Requesting device code', { clientId, scope })

  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: scope || 'public_repo',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('Device code request failed', {
      status: response.status,
      statusText: response.statusText,
    })
    throw new Error(`Device code request failed: ${response.statusText} - ${error}`)
  }

  const result = (await response.json()) as DeviceCodeResponse

  logger.info('Device code obtained', {
    userCode: result.user_code,
    expiresIn: result.expires_in,
    interval: result.interval,
  })

  return result
}

/**
 * Poll for access token
 * @param clientId GitHub OAuth App client ID
 * @param deviceCode Device code from initial request
 * @param interval Polling interval in seconds (from device code response)
 * @returns Access token if authorized, null if pending
 */
export async function pollForToken(
  clientId: string,
  deviceCode: string,
  interval = 5
): Promise<GitHubToken | null> {
  logger.debug('Polling for token')

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })

  const result = (await response.json()) as AccessTokenResponse

  // Handle various OAuth error states
  if (result.error === 'authorization_pending') {
    // User hasn't authorized yet
    logger.debug('Authorization pending')
    return null
  }

  if (result.error === 'slow_down') {
    // Rate limiting - should increase interval
    logger.warn('Rate limit hit, slow down polling', { interval })
    // Return null but caller should increase interval
    return null
  }

  if (result.error === 'expired_token') {
    logger.error('Device code expired')
    throw new Error('Device code has expired. Please start authentication again.')
  }

  if (result.error === 'access_denied') {
    logger.error('Access denied by user')
    throw new Error('User denied access to the application.')
  }

  if (result.error) {
    logger.error('Token poll error', {
      error: result.error,
      description: result.error_description,
    })
    throw new Error(`Token poll error: ${result.error_description || result.error}`)
  }

  // Success - we have a token
  if (result.access_token) {
    logger.info('Access token obtained', {
      tokenType: result.token_type,
      scope: result.scope,
    })

    return {
      access_token: result.access_token,
      token_type: result.token_type || 'bearer',
      scope: result.scope,
    }
  }

  // Unexpected state
  logger.error('Unexpected response from token endpoint', { result })
  throw new Error('Unexpected response from GitHub token endpoint')
}

/**
 * Fetch GitHub user information
 * @param accessToken GitHub access token
 * @returns GitHub user information
 */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  logger.debug('Fetching GitHub user information')

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Hatago-GitHub-OAuth/1.0',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('Failed to fetch user information', {
      status: response.status,
      statusText: response.statusText,
    })
    throw new Error(`Failed to fetch user: ${response.statusText} - ${error}`)
  }

  const user = (await response.json()) as GitHubUser

  logger.info('User information fetched', {
    login: user.login,
    id: user.id,
    type: user.type,
  })

  return user
}

/**
 * Revoke GitHub access token
 * @param clientId GitHub OAuth App client ID
 * @param clientSecret GitHub OAuth App client secret
 * @param accessToken Access token to revoke
 */
export async function revokeToken(
  clientId: string,
  clientSecret: string,
  accessToken: string
): Promise<void> {
  logger.debug('Revoking access token')

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const response = await fetch(`https://api.github.com/applications/${clientId}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Hatago-GitHub-OAuth/1.0',
      },
      body: JSON.stringify({
        access_token: accessToken,
      }),
    })

    if (response.ok || response.status === 404) {
      // 204 No Content on success, 404 if token was already invalid
      logger.info('Access token revoked successfully')
    } else {
      logger.warn('Token revocation may have failed', {
        status: response.status,
        statusText: response.statusText,
      })
    }
  } catch (error) {
    // Log but don't throw - best effort revocation
    logger.error('Error revoking token', { error })
  }
}

/**
 * Create a human-readable expiry time string
 * @param expiresIn Seconds until expiry
 * @returns Human-readable time string
 */
export function formatExpiryTime(expiresIn: number): string {
  const minutes = Math.floor(expiresIn / 60)
  const seconds = expiresIn % 60

  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`
}
