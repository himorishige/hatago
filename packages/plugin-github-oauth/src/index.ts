/**
 * GitHub OAuth Plugin for Hatago
 * Provides both traditional OAuth and device flow authentication
 */

import type { HatagoPlugin } from '@hatago/core'
import { createDefaultLogger } from '@hatago/core'
import { z } from 'zod'

const logger = createDefaultLogger('plugin-github-oauth')

// Import types from types.ts
import type { GitHubOAuthConfig, GitHubToken } from './types.js'

/**
 * GitHub OAuth client instance interface
 */
interface GitHubOAuthClientInstance {
  needsAuthentication(): Promise<boolean>
  authenticate(): Promise<void>
  apiRequest(endpoint: string, options?: any): Promise<any>
  getCurrentUser(): Promise<any>
  listRepositories(options?: { per_page?: number; sort?: string }): Promise<any[]>
  searchRepositories(query: string, options?: { per_page?: number }): Promise<any>
  getRepository(owner: string, repo: string): Promise<any>
  listIssues(
    owner: string,
    repo: string,
    options?: { state?: string; per_page?: number }
  ): Promise<any[]>
}

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
 * Create GitHub OAuth client instance
 */
export function createGitHubOAuthClient(
  config: GitHubOAuthConfig,
  env: Record<string, unknown> = {}
): GitHubOAuthClientInstance {
  const clientConfig = {
    scope: 'repo read:user',
    userAgent: 'Hatago-GitHub-Plugin/1.0',
    ...config,
  }

  let currentToken: GitHubToken | undefined

  // Helper functions for token management
  const getAuthHeader = (): string => {
    if (!currentToken) {
      throw new Error('No GitHub token available')
    }

    if (currentToken.token_type === 'token') {
      return `token ${currentToken.access_token}`
    }

    return `Bearer ${currentToken.access_token}`
  }

  const isTokenExpired = async (): Promise<boolean> => {
    if (!currentToken?.expires_at) {
      return false // Personal access tokens don't expire
    }

    return Date.now() >= currentToken.expires_at
  }

  /**
   * Check if authentication is needed
   */
  const needsAuthentication = async (): Promise<boolean> => {
    // Check environment token first
    const envToken =
      getEnvVar(env, 'GITHUB_PERSONAL_ACCESS_TOKEN') || getEnvVar(env, 'GITHUB_TOKEN')
    if (envToken) {
      currentToken = {
        access_token: envToken,
        token_type: 'token',
      }
      return false
    }

    // Check stored OAuth token
    return !currentToken || (await isTokenExpired())
  }

  /**
   * Perform OAuth authentication flow
   */
  const authenticate = async (): Promise<void> => {
    if (!clientConfig.clientId || !clientConfig.clientSecret) {
      throw new Error(
        'GitHub OAuth requires clientId and clientSecret. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
      )
    }

    logger.info('Starting GitHub OAuth authentication flow', { tool: 'github_oauth' })

    // Traditional OAuth flow is not supported in MCP context
    // Recommend using device flow instead
    throw new Error(
      'Traditional OAuth flow not supported in MCP context. Please use device flow authentication instead.'
    )
  }

  /**
   * Make authenticated API request
   */
  const apiRequest = async (endpoint: string, options: any = {}): Promise<any> => {
    if (await needsAuthentication()) {
      await authenticate()
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: getAuthHeader(),
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': clientConfig.userAgent,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${error}`)
    }

    return response.json()
  }

  /**
   * Get current user information
   */
  const getCurrentUser = async (): Promise<any> => {
    return apiRequest('/user')
  }

  /**
   * List user repositories
   */
  const listRepositories = async (
    options: { per_page?: number; sort?: string } = {}
  ): Promise<any[]> => {
    const params = new URLSearchParams({
      per_page: String(options.per_page || 30),
      sort: options.sort || 'updated',
    })

    return apiRequest(`/user/repos?${params}`)
  }

  /**
   * Search repositories
   */
  const searchRepositories = async (
    query: string,
    options: { per_page?: number } = {}
  ): Promise<any> => {
    const params = new URLSearchParams({
      q: query,
      per_page: String(options.per_page || 30),
    })

    return apiRequest(`/search/repositories?${params}`)
  }

  /**
   * Get repository information
   */
  const getRepository = async (owner: string, repo: string): Promise<any> => {
    return apiRequest(`/repos/${owner}/${repo}`)
  }

  /**
   * List repository issues
   */
  const listIssues = async (
    owner: string,
    repo: string,
    options: { state?: string; per_page?: number } = {}
  ): Promise<any[]> => {
    const params = new URLSearchParams({
      state: options.state || 'open',
      per_page: String(options.per_page || 30),
    })

    return apiRequest(`/repos/${owner}/${repo}/issues?${params}`)
  }

  return {
    needsAuthentication,
    authenticate,
    apiRequest,
    getCurrentUser,
    listRepositories,
    searchRepositories,
    getRepository,
    listIssues,
  }
}

/**
 * Legacy GitHub API client with OAuth support
 * @deprecated Use createGitHubOAuthClient() instead
 */
class _GitHubOAuthClient {
  private client: GitHubOAuthClientInstance

  constructor(config: GitHubOAuthConfig) {
    this.client = createGitHubOAuthClient(config)
  }

  async needsAuthentication(): Promise<boolean> {
    return this.client.needsAuthentication()
  }

  async authenticate(): Promise<void> {
    return this.client.authenticate()
  }

  async apiRequest(endpoint: string, options: any = {}): Promise<any> {
    return this.client.apiRequest(endpoint, options)
  }

  async getCurrentUser(): Promise<any> {
    return this.client.getCurrentUser()
  }

  async listRepositories(options: { per_page?: number; sort?: string } = {}): Promise<any[]> {
    return this.client.listRepositories(options)
  }

  async searchRepositories(query: string, options: { per_page?: number } = {}): Promise<any> {
    return this.client.searchRepositories(query, options)
  }

  async getRepository(owner: string, repo: string): Promise<any> {
    return this.client.getRepository(owner, repo)
  }

  async listIssues(
    owner: string,
    repo: string,
    options: { state?: string; per_page?: number } = {}
  ): Promise<any[]> {
    return this.client.listIssues(owner, repo, options)
  }
}

/**
 * GitHub OAuth Test Plugin (Legacy)
 * @deprecated Use createGitHubDeviceFlowPlugin() for modern OAuth support
 */
export const githubOAuthTestPlugin: HatagoPlugin = async ctx => {
  const { app, server, env = {} } = ctx

  // Initialize GitHub client
  const githubClient = createGitHubOAuthClient(
    {
      clientId: getEnvVar(env, 'GITHUB_CLIENT_ID'),
      clientSecret: getEnvVar(env, 'GITHUB_CLIENT_SECRET'),
      scope: 'repo read:user read:org',
    },
    env
  )

  // Register MCP tools with handlers
  server.registerTool(
    'github_user',
    {
      title: 'Get GitHub User',
      description: 'Get current GitHub user information',
      inputSchema: {},
    },
    async (_args, _extra) => {
      try {
        const user = await githubClient.getCurrentUser()
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(user, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  server.registerTool(
    'github_repos',
    {
      title: 'List GitHub Repositories',
      description: 'List user repositories',
      inputSchema: {
        per_page: z
          .number()
          .min(1)
          .max(100)
          .default(30)
          .optional()
          .describe('Number of repositories per page (max 100)'),
        sort: z
          .enum(['created', 'updated', 'pushed', 'full_name'])
          .default('updated')
          .optional()
          .describe('Sort repositories by'),
      },
    },
    async (args, _extra) => {
      try {
        const repos = await githubClient.listRepositories(args)
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
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  server.registerTool(
    'github_search',
    {
      title: 'Search GitHub Repositories',
      description: 'Search GitHub repositories',
      inputSchema: {
        query: z.string().describe('Search query'),
        per_page: z
          .number()
          .min(1)
          .max(100)
          .default(30)
          .optional()
          .describe('Number of results per page (max 100)'),
      },
    },
    async (args, _extra) => {
      try {
        const results = await githubClient.searchRepositories(args.query, args)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  server.registerTool(
    'github_repo',
    {
      title: 'Get GitHub Repository',
      description: 'Get repository information',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
      },
    },
    async (args, _extra) => {
      try {
        const repo = await githubClient.getRepository(args.owner, args.repo)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(repo, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  server.registerTool(
    'github_issues',
    {
      title: 'List GitHub Issues',
      description: 'List repository issues',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).default('open').optional().describe('Issue state'),
        per_page: z
          .number()
          .min(1)
          .max(100)
          .default(30)
          .optional()
          .describe('Number of issues per page (max 100)'),
      },
    },
    async (args, _extra) => {
      try {
        const issues = await githubClient.listIssues(args.owner, args.repo, args)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issues, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  // Add HTTP health endpoint (only in http mode)
  if (app && ctx.mode === 'http') {
    app.get('/github/health', async c => {
      try {
        const needsAuth = await githubClient.needsAuthentication()

        return c.json({
          status: 'ok',
          plugin: 'github-oauth-test',
          authentication: {
            required: needsAuth,
            configured: !!(
              getEnvVar(env, 'GITHUB_PERSONAL_ACCESS_TOKEN') ||
              getEnvVar(env, 'GITHUB_TOKEN') ||
              (getEnvVar(env, 'GITHUB_CLIENT_ID') && getEnvVar(env, 'GITHUB_CLIENT_SECRET'))
            ),
          },
          timestamp: new Date().toISOString(),
        })
      } catch (error) {
        return c.json(
          {
            status: 'error',
            error: (error as Error).message,
            timestamp: new Date().toISOString(),
          },
          500
        )
      }
    })

    // Add OAuth setup endpoint
    app.get('/github/auth/setup', async c => {
      return c.json({
        message: 'GitHub OAuth Setup',
        steps: [
          '1. Create GitHub OAuth App at https://github.com/settings/applications/new',
          '2. Set Authorization callback URL to: http://localhost:3000/callback',
          '3. Set environment variables:',
          '   GITHUB_CLIENT_ID=your_client_id',
          '   GITHUB_CLIENT_SECRET=your_client_secret',
          '4. Or use Personal Access Token:',
          '   GITHUB_PERSONAL_ACCESS_TOKEN=your_token',
        ],
        currentConfig: {
          hasClientId: !!getEnvVar(env, 'GITHUB_CLIENT_ID'),
          hasClientSecret: !!getEnvVar(env, 'GITHUB_CLIENT_SECRET'),
          hasPersonalToken: !!getEnvVar(env, 'GITHUB_PERSONAL_ACCESS_TOKEN'),
          hasGenericToken: !!getEnvVar(env, 'GITHUB_TOKEN'),
        },
      })
    })
  }

  const pluginLogger = createDefaultLogger('github-oauth-test')

  pluginLogger.info('GitHub OAuth Plugin loaded successfully')
  pluginLogger.info('Available tools registered', {
    tools: ['github_user', 'github_repos', 'github_search', 'github_repo', 'github_issues'],
  })

  if (ctx.mode === 'http') {
    pluginLogger.info('HTTP endpoints available', {
      endpoints: ['/github/health', '/github/auth/setup'],
    })
  } else {
    pluginLogger.info('Running in stdio mode - HTTP endpoints disabled')
  }
}

export default githubOAuthTestPlugin

// Export device flow plugin and related utilities
export { createGitHubDeviceFlowPlugin } from './plugin.js'
export { SessionStore } from './session-store.js'
export { testSharedAppPlugin } from './test-shared-app.js'
export {
  getGitHubConfig,
  isUsingSharedApp,
  getSetupInstructions,
  HATAGO_GITHUB_CONFIG,
} from './config.js'
export type {
  DeviceAuthSession,
  GitHubDeviceFlowConfig,
  GitHubToken,
  GitHubOAuthConfig,
  GitHubUser,
  DeviceCodeResponse,
  AccessTokenResponse,
} from './types.js'
