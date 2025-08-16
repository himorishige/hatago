/**
 * GitHub OAuth Test Plugin for Hatago
 * 実際のGitHub APIを使用したOAuth認証テスト
 */

import crypto from 'crypto'
import { createServer } from 'http'
import type { HatagoPlugin } from '@hatago/core'
import { createDefaultLogger } from '@hatago/core'
import { z } from 'zod'

const logger = createDefaultLogger('plugin-github-oauth')

/**
 * GitHub OAuth configuration
 */
export interface GitHubOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
  userAgent?: string
}

/**
 * GitHub token structure
 */
interface GitHubToken {
  access_token: string
  token_type: string
  scope?: string
  expires_at?: number
}

/**
 * GitHub API client with OAuth support
 */
class GitHubOAuthClient {
  private config: GitHubOAuthConfig
  private token?: GitHubToken

  constructor(config: GitHubOAuthConfig) {
    this.config = {
      scope: 'repo read:user',
      userAgent: 'Hatago-GitHub-Plugin/1.0',
      ...config,
    }
  }

  /**
   * Check if authentication is needed
   */
  async needsAuthentication(): Promise<boolean> {
    // Check environment token first
    const envToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN
    if (envToken) {
      this.token = {
        access_token: envToken,
        token_type: 'token',
      }
      return false
    }

    // Check stored OAuth token
    return !this.token || (await this.isTokenExpired())
  }

  /**
   * Perform OAuth authentication flow
   */
  async authenticate(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'GitHub OAuth requires clientId and clientSecret. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
      )
    }

    logger.info('Starting GitHub OAuth authentication flow', { tool: 'github_oauth' })

    // Generate PKCE challenge
    const pkce = this.generatePKCE()

    // Start local callback server
    const callbackUrl = await this.startCallbackServer()

    // Build authorization URL
    const authUrl = this.buildAuthorizationUrl(callbackUrl, pkce.challenge)

    logger.info('GitHub OAuth authorization URL generated', {
      tool: 'github_oauth',
      auth_url: authUrl,
    })
    logger.info('Waiting for OAuth callback', { tool: 'github_oauth' })

    // In a real implementation, this would open the browser
    // For testing, we'll simulate the flow
    throw new Error(
      'OAuth flow requires manual browser interaction. Please set GITHUB_PERSONAL_ACCESS_TOKEN for testing.'
    )
  }

  /**
   * Make authenticated API request
   */
  async apiRequest(endpoint: string, options: any = {}): Promise<any> {
    if (await this.needsAuthentication()) {
      await this.authenticate()
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.getAuthHeader(),
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': this.config.userAgent,
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
  async getCurrentUser(): Promise<any> {
    return this.apiRequest('/user')
  }

  /**
   * List user repositories
   */
  async listRepositories(options: { per_page?: number; sort?: string } = {}): Promise<any[]> {
    const params = new URLSearchParams({
      per_page: String(options.per_page || 30),
      sort: options.sort || 'updated',
    })

    return this.apiRequest(`/user/repos?${params}`)
  }

  /**
   * Search repositories
   */
  async searchRepositories(query: string, options: { per_page?: number } = {}): Promise<any> {
    const params = new URLSearchParams({
      q: query,
      per_page: String(options.per_page || 30),
    })

    return this.apiRequest(`/search/repositories?${params}`)
  }

  /**
   * Get repository information
   */
  async getRepository(owner: string, repo: string): Promise<any> {
    return this.apiRequest(`/repos/${owner}/${repo}`)
  }

  /**
   * List repository issues
   */
  async listIssues(
    owner: string,
    repo: string,
    options: { state?: string; per_page?: number } = {}
  ): Promise<any[]> {
    const params = new URLSearchParams({
      state: options.state || 'open',
      per_page: String(options.per_page || 30),
    })

    return this.apiRequest(`/repos/${owner}/${repo}/issues?${params}`)
  }

  // Private helper methods

  private getAuthHeader(): string {
    if (!this.token) {
      throw new Error('No GitHub token available')
    }

    if (this.token.token_type === 'token') {
      return `token ${this.token.access_token}`
    }

    return `Bearer ${this.token.access_token}`
  }

  private generatePKCE(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString('base64url')
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
    return { verifier, challenge }
  }

  private buildAuthorizationUrl(redirectUri: string, challenge: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId!,
      redirect_uri: redirectUri,
      scope: this.config.scope!,
      state: crypto.randomBytes(16).toString('hex'),
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })

    return `https://github.com/login/oauth/authorize?${params}`
  }

  private async startCallbackServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h1>OAuth callback received</h1><p>You can close this window.</p>')
        server.close()
      })

      server.listen(0, 'localhost', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to start callback server'))
          return
        }

        const port = address.port
        resolve(`http://localhost:${port}/callback`)
      })

      server.on('error', reject)
    })
  }

  private async isTokenExpired(): Promise<boolean> {
    if (!this.token?.expires_at) {
      return false // Personal access tokens don't expire
    }

    return Date.now() >= this.token.expires_at
  }
}

/**
 * GitHub OAuth Test Plugin
 */
export const githubOAuthTestPlugin: HatagoPlugin = async ctx => {
  const { app, server } = ctx

  // Initialize GitHub client
  const githubClient = new GitHubOAuthClient({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    scope: 'repo read:user read:org',
  })

  // Register MCP tools with handlers
  server.registerTool(
    'github_user',
    {
      title: 'Get GitHub User',
      description: 'Get current GitHub user information',
      inputSchema: {},
    },
    async (args, extra) => {
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
    async (args, extra) => {
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
    async (args, extra) => {
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
    async (args, extra) => {
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
    async (args, extra) => {
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
              process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
              process.env.GITHUB_TOKEN ||
              (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
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
          hasClientId: !!process.env.GITHUB_CLIENT_ID,
          hasClientSecret: !!process.env.GITHUB_CLIENT_SECRET,
          hasPersonalToken: !!process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
          hasGenericToken: !!process.env.GITHUB_TOKEN,
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
