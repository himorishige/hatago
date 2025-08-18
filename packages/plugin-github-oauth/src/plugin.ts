/**
 * GitHub OAuth Device Flow MCP Plugin
 * Provides secure GitHub authentication via device flow
 */
import type { HatagoPlugin } from '@hatago/core'
import { createDefaultLogger, createPluginSessionContext, generateSessionId } from '@hatago/core'
import { z } from 'zod'
import { getGitHubConfig, getSetupInstructions, isUsingSharedApp } from './config.js'
import {
  fetchGitHubUser,
  formatExpiryTime,
  pollForToken,
  requestDeviceCode,
  revokeToken,
} from './device-flow.js'
import type { DeviceAuthSession, GitHubDeviceFlowConfig } from './types.js'

const logger = createDefaultLogger('github-oauth-plugin')

/**
 * 接続ごとの一意識別子を生成
 * HTTPリクエストから接続を識別するための簡易実装
 */

const PLUGIN_ID = 'github-oauth'

/**
 * Create GitHub Device Flow Plugin with optional configuration
 *
 * Uses MCP session management for multi-user support.
 * Each MCP session maintains separate authentication state.
 *
 * @param config Plugin configuration (optional - uses shared app if not provided)
 * @returns Hatago plugin
 */
export function createGitHubDeviceFlowPlugin(
  config?: Partial<GitHubDeviceFlowConfig>
): HatagoPlugin {
  return ctx => {
    const { server, env = {} } = ctx

    // Get configuration from environment with fallback to shared app
    const finalConfig = config?.clientId
      ? { ...getGitHubConfig(env), ...config }
      : getGitHubConfig(env)

    // Create plugin-scoped session context with namespace isolation
    const pluginSession = createPluginSessionContext(server, PLUGIN_ID)

    /**
     * Helper to get current session with validation using namespaced session management
     */
    const getCurrentSession = (): DeviceAuthSession | undefined => {
      if (!pluginSession.sessionId) return undefined

      // Get plugin data from namespaced session store
      const sessionData = pluginSession.sessionStore.get('auth-session')

      return sessionData as DeviceAuthSession | undefined
    }

    /**
     * Helper to save session data using namespaced session management
     */
    const saveSession = (sessionData: DeviceAuthSession): void => {
      if (!pluginSession.sessionId) {
        throw new Error('No active MCP session')
      }

      pluginSession.sessionStore.set('auth-session', sessionData)
    }

    /**
     * Helper to make authenticated GitHub API request
     */
    const makeAuthenticatedRequest = async (
      endpoint: string,
      options: RequestInit = {}
    ): Promise<any> => {
      const session = getCurrentSession()
      if (!session?.githubToken) {
        throw new Error('Not authenticated. Please run github_auth_start first.')
      }

      const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`

      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${session.githubToken.access_token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Hatago-GitHub-OAuth/1.0',
          ...options.headers,
        },
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${error}`)
      }

      return response.json()
    }

    // Register MCP tools

    /**
     * Start GitHub authentication
     */
    server.registerTool(
      'github_auth_start',
      {
        title: 'Start GitHub Authentication',
        description:
          'Start GitHub authentication using device flow. Returns a user code and verification URL.',
        inputSchema: {
          scope: z.string().optional().describe('OAuth scopes to request (default: public_repo)'),
        },
      },
      async args => {
        try {
          if (!pluginSession.sessionId) {
            throw new Error('No active MCP session available')
          }

          // Request device code from GitHub
          const deviceCodeResponse = await requestDeviceCode(
            finalConfig.clientId,
            args.scope || finalConfig.scope
          )

          // Create new authentication session data
          const authSession: DeviceAuthSession = {
            id: pluginSession.sessionId,
            deviceCode: deviceCodeResponse.device_code,
            userCode: deviceCodeResponse.user_code,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            expiresAt: Date.now() + deviceCodeResponse.expires_in * 1000,
          }

          // Save to MCP session
          saveSession(authSession)

          logger.info('Device flow authentication started', {
            userCode: deviceCodeResponse.user_code,
          })

          // Return user-facing information only (no device_code)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  user_code: deviceCodeResponse.user_code,
                  verification_uri: deviceCodeResponse.verification_uri,
                  expires_in: formatExpiryTime(deviceCodeResponse.expires_in),
                  message: `Please visit ${deviceCodeResponse.verification_uri} and enter code: ${deviceCodeResponse.user_code}`,
                }),
              },
            ],
          }
        } catch (error) {
          logger.error('Failed to start authentication', { error })
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Authentication start failed: ${(error as Error).message}`,
                }),
              },
            ],
            isError: true,
          }
        }
      }
    )

    /**
     * Check authentication status
     */
    server.registerTool(
      'github_auth_status',
      {
        title: 'Check Authentication Status',
        description:
          'Check the status of GitHub authentication. Polls for token if authentication is pending.',
        inputSchema: {},
      },
      async () => {
        try {
          if (!pluginSession.sessionId) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: 'not_started',
                    message: 'Authentication not started. Please run github_auth_start first.',
                  }),
                },
              ],
            }
          }

          const session = getCurrentSession()
          if (!session) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: 'not_started',
                    message: 'Authentication not started. Please run github_auth_start first.',
                  }),
                },
              ],
            }
          }

          // Already authenticated and session rotated
          if (session.githubToken && session.sessionRotated) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: 'authenticated',
                    username: session.userId,
                    scope: session.githubToken.scope,
                    message: `Successfully authenticated as ${session.userId}`,
                  }),
                },
              ],
            }
          }

          // Already authenticated but session not rotated - rotate now
          if (session.githubToken && !session.sessionRotated) {
            // SECURITY: Rotate session ID to prevent session fixation attacks
            const mainSessionContext = (server as any).getSessionContext?.()
            if (!mainSessionContext) {
              throw new Error('Failed to access session context for rotation')
            }

            const oldSessionId = pluginSession.sessionId!
            const newSessionId = generateSessionId()

            // Rotate session (move data to new ID, delete old)
            const rotated = mainSessionContext.sessionStore.rotateSession(
              oldSessionId,
              newSessionId
            )

            if (!rotated) {
              throw new Error('Failed to rotate session for security')
            }

            // Create new plugin session context with rotated session ID
            const newPluginSession = createPluginSessionContext(server, PLUGIN_ID)

            // Update session with rotation flag using new session ID
            const updatedSession: DeviceAuthSession = {
              ...session,
              id: newSessionId,
              sessionRotated: true,
              lastAccessedAt: Date.now(),
            }

            // Save to new session
            newPluginSession.sessionStore.set('auth-session', updatedSession)

            logger.info('Session rotated for existing authentication', {
              username: session.userId,
              rotated: true,
            })

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: 'authenticated',
                    username: session.userId,
                    scope: session.githubToken.scope,
                    message: `Successfully authenticated as ${session.userId}`,
                    sessionRotated: true,
                    newSessionId: newSessionId,
                    notice:
                      'Session ID has been rotated for security. Please use the new session ID for subsequent requests.',
                  }),
                },
              ],
            }
          }

          // Poll for token if device code exists
          if (session.deviceCode) {
            const token = await pollForToken(finalConfig.clientId, session.deviceCode)

            if (token) {
              // Authentication successful - fetch user information
              const user = await fetchGitHubUser(token.access_token)

              // SECURITY: Rotate session ID to prevent session fixation attacks
              // Need to access the main session context for rotation
              const mainSessionContext = (server as any).getSessionContext?.()
              if (!mainSessionContext) {
                throw new Error('Failed to access session context for rotation')
              }

              const oldSessionId = pluginSession.sessionId!
              const newSessionId = generateSessionId()

              // Rotate session (move data to new ID, delete old)
              const rotated = mainSessionContext.sessionStore.rotateSession(
                oldSessionId,
                newSessionId
              )

              if (!rotated) {
                throw new Error('Failed to rotate session for security')
              }

              // Create new plugin session context with rotated session ID
              const newPluginSession = createPluginSessionContext(server, PLUGIN_ID)

              // Update session with token and user info using new session ID
              const updatedSession: DeviceAuthSession = {
                ...session,
                id: newSessionId,
                githubToken: token,
                userId: user.login,
                sessionRotated: true,
                lastAccessedAt: Date.now(),
              }

              // Save to new session
              newPluginSession.sessionStore.set('auth-session', updatedSession)

              logger.info('Authentication completed with session rotation', {
                username: user.login,
                rotated: true,
              })

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      status: 'authenticated',
                      username: user.login,
                      name: user.name,
                      scope: token.scope,
                      message: `Successfully authenticated as ${user.login}`,
                      sessionRotated: true,
                      newSessionId: newSessionId,
                      notice:
                        'Session ID has been rotated for security. Please use the new session ID for subsequent requests.',
                    }),
                  },
                ],
              }
            }

            // Still pending
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: 'pending',
                    user_code: session.userCode,
                    message: `Waiting for authorization. Please enter code: ${session.userCode}`,
                  }),
                },
              ],
            }
          }

          // Unexpected state
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'error',
                  message: 'Session in unexpected state. Please start authentication again.',
                }),
              },
            ],
            isError: true,
          }
        } catch (error) {
          logger.error('Error checking authentication status', { error })
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Status check failed: ${(error as Error).message}`,
                }),
              },
            ],
            isError: true,
          }
        }
      }
    )

    /**
     * Logout and revoke token
     */
    server.registerTool(
      'github_logout',
      {
        title: 'GitHub Logout',
        description: 'Logout from GitHub and revoke the access token.',
        inputSchema: {},
      },
      async () => {
        try {
          if (!pluginSession.sessionId) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: 'no_session',
                    message: 'No active MCP session available.',
                  }),
                },
              ],
            }
          }

          const session = getCurrentSession()

          if (session?.githubToken) {
            // Best effort token revocation (requires client secret)
            if (finalConfig.clientSecret) {
              await revokeToken(
                finalConfig.clientId,
                finalConfig.clientSecret,
                session.githubToken.access_token
              )
            }
          }

          // Delete session data from namespaced plugin store
          pluginSession.sessionStore.delete('auth-session')

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'logged_out',
                  message: 'Successfully logged out from GitHub.',
                }),
              },
            ],
          }
        } catch (error) {
          logger.error('Error during logout', { error })
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Logout failed: ${(error as Error).message}`,
                }),
              },
            ],
            isError: true,
          }
        }
      }
    )

    /**
     * Get current user (authenticated)
     */
    server.registerTool(
      'github_user_authenticated',
      {
        title: 'Get Authenticated GitHub User',
        description: 'Get current authenticated GitHub user information.',
        inputSchema: {},
      },
      async () => {
        try {
          logger.debug('Getting authenticated user', {
            sessionValid: !!getCurrentSession(),
          })

          const user = await makeAuthenticatedRequest('/user')
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(user, null, 2),
              },
            ],
          }
        } catch (error) {
          logger.error('Error getting authenticated user', {
            error: (error as Error).message,
            hasSession: !!getCurrentSession(),
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: (error as Error).message,
                }),
              },
            ],
            isError: true,
          }
        }
      }
    )

    /**
     * List repositories (authenticated)
     */
    server.registerTool(
      'github_repos_authenticated',
      {
        title: 'List Authenticated User Repositories',
        description: 'List repositories for the authenticated user.',
        inputSchema: {
          per_page: z
            .number()
            .min(1)
            .max(100)
            .default(30)
            .optional()
            .describe('Number of repositories per page'),
          sort: z
            .enum(['created', 'updated', 'pushed', 'full_name'])
            .default('updated')
            .optional()
            .describe('Sort repositories by'),
          type: z
            .enum(['all', 'owner', 'public', 'private', 'member'])
            .default('all')
            .optional()
            .describe('Type of repositories to list'),
        },
      },
      async args => {
        try {
          const params = new URLSearchParams({
            per_page: String(args.per_page || 30),
            sort: args.sort || 'updated',
            type: args.type || 'all',
          })

          const repos = await makeAuthenticatedRequest(`/user/repos?${params}`)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(repos, null, 2),
              },
            ],
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: (error as Error).message,
                }),
              },
            ],
            isError: true,
          }
        }
      }
    )

    // Log plugin initialization
    logger.info('GitHub Device Flow Plugin initialized', {
      clientId: finalConfig.clientId,
      scope: finalConfig.scope || 'public_repo',
      sessionTTL: finalConfig.sessionTTL || 900,
      idleTimeout: finalConfig.idleTimeout || 300,
      usingSharedApp: isUsingSharedApp(finalConfig),
      sessionManagement: 'MCP Session Context',
    })

    // Multi-user support confirmation
    logger.info('✅ Multi-user session management enabled via MCP Session Context', {
      sessionIsolation: 'Each MCP session maintains separate authentication state',
      security: 'No session conflicts between concurrent users',
    })

    // Log setup instructions
    const instructions = getSetupInstructions(finalConfig)
    logger.info('GitHub OAuth setup instructions', { instructions })

    // Session cleanup is handled by MCP Session Context automatically
  }
}
