import type { HatagoContext } from '@hatago/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type GitHubOAuthConfig, githubOAuthTestPlugin } from '../src/index.js'

// Mock @hatago/core
vi.mock('@hatago/core', () => ({
  createDefaultLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

// Mock fetch globally
global.fetch = vi.fn()

describe('GitHub OAuth Plugin', () => {
  let mockContext: HatagoContext
  let mockServer: any
  let mockApp: any
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = process.env

    mockServer = {
      registerTool: vi.fn(),
    }

    mockApp = {
      get: vi.fn(),
    }

    mockContext = {
      app: mockApp,
      server: mockServer,
      env: {},
      getBaseUrl: vi.fn(),
      mode: 'http',
    }

    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should register all GitHub tools', async () => {
    await githubOAuthTestPlugin(mockContext)

    const expectedTools = [
      'github_user',
      'github_repos',
      'github_search',
      'github_repo',
      'github_issues',
    ]

    expect(mockServer.registerTool).toHaveBeenCalledTimes(expectedTools.length)

    expectedTools.forEach(toolName => {
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        toolName,
        expect.any(Object),
        expect.any(Function)
      )
    })
  })

  it('should register HTTP endpoints in http mode', async () => {
    await githubOAuthTestPlugin(mockContext)

    expect(mockApp.get).toHaveBeenCalledWith('/github/health', expect.any(Function))
    expect(mockApp.get).toHaveBeenCalledWith('/github/auth/setup', expect.any(Function))
  })

  it('should not register HTTP endpoints in stdio mode', async () => {
    mockContext.mode = 'stdio'
    mockContext.app = null

    await githubOAuthTestPlugin(mockContext)

    expect(mockApp.get).not.toHaveBeenCalled()
  })

  describe('GitHub API Client', () => {
    it('should use personal access token from environment', async () => {
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'test-token'

      await githubOAuthTestPlugin(mockContext)

      // Get github_user tool handler
      const userToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_user'
      )[2]

      // Mock successful API response
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: 'testuser', id: 123 }),
      } as Response)

      const result = await userToolHandler({}, {})

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token test-token',
          }),
        })
      )

      expect(result.content[0].text).toContain('testuser')
    })

    it('should handle API errors gracefully', async () => {
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'invalid-token'

      await githubOAuthTestPlugin(mockContext)

      const userToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_user'
      )[2]

      // Mock API error response
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Bad credentials',
      } as Response)

      const result = await userToolHandler({}, {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('GitHub API error')
    })

    it('should throw error when no authentication is configured', async () => {
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN
      delete process.env.GITHUB_TOKEN
      delete process.env.GITHUB_CLIENT_ID
      delete process.env.GITHUB_CLIENT_SECRET

      await githubOAuthTestPlugin(mockContext)

      const userToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_user'
      )[2]

      const result = await userToolHandler({}, {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('GitHub OAuth requires clientId and clientSecret')
    })
  })

  describe('Tool Functionality', () => {
    beforeEach(() => {
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'test-token'
    })

    it('should handle github_repos tool with parameters', async () => {
      await githubOAuthTestPlugin(mockContext)

      const reposToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_repos'
      )[2]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: 'repo1' }, { name: 'repo2' }],
      } as Response)

      const result = await reposToolHandler({ per_page: 10, sort: 'created' }, {})

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/user/repos?per_page=10&sort=created',
        expect.any(Object)
      )

      expect(result.content[0].text).toContain('repo1')
    })

    it('should handle github_search tool', async () => {
      await githubOAuthTestPlugin(mockContext)

      const searchToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_search'
      )[2]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ name: 'search-result' }] }),
      } as Response)

      const result = await searchToolHandler({ query: 'test', per_page: 5 }, {})

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/search/repositories?q=test&per_page=5',
        expect.any(Object)
      )

      expect(result.content[0].text).toContain('search-result')
    })

    it('should handle github_repo tool', async () => {
      await githubOAuthTestPlugin(mockContext)

      const repoToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_repo'
      )[2]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'test-repo', owner: { login: 'testuser' } }),
      } as Response)

      const result = await repoToolHandler({ owner: 'testuser', repo: 'test-repo' }, {})

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/test-repo',
        expect.any(Object)
      )

      expect(result.content[0].text).toContain('test-repo')
    })

    it('should handle github_issues tool', async () => {
      await githubOAuthTestPlugin(mockContext)

      const issuesToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_issues'
      )[2]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [{ title: 'Test Issue', number: 1 }],
      } as Response)

      const result = await issuesToolHandler(
        { owner: 'testuser', repo: 'test-repo', state: 'open' },
        {}
      )

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/test-repo/issues?state=open&per_page=30',
        expect.any(Object)
      )

      expect(result.content[0].text).toContain('Test Issue')
    })
  })

  describe('HTTP Endpoints', () => {
    beforeEach(() => {
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'test-token'
    })

    it('should handle health endpoint correctly', async () => {
      await githubOAuthTestPlugin(mockContext)

      const healthHandler = mockApp.get.mock.calls.find(call => call[0] === '/github/health')[1]

      const mockResponse = { json: vi.fn() }
      await healthHandler(mockResponse)

      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'ok',
        plugin: 'github-oauth-test',
        authentication: {
          required: false,
          configured: true,
        },
        timestamp: expect.any(String),
      })
    })

    it('should handle auth setup endpoint', async () => {
      await githubOAuthTestPlugin(mockContext)

      const setupHandler = mockApp.get.mock.calls.find(call => call[0] === '/github/auth/setup')[1]

      const mockResponse = { json: vi.fn() }
      await setupHandler(mockResponse)

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'GitHub OAuth Setup',
        steps: expect.arrayContaining([
          expect.stringContaining('Create GitHub OAuth App'),
          expect.stringContaining('GITHUB_CLIENT_ID'),
          expect.stringContaining('GITHUB_PERSONAL_ACCESS_TOKEN'),
        ]),
        currentConfig: {
          hasClientId: false,
          hasClientSecret: false,
          hasPersonalToken: true,
          hasGenericToken: false,
        },
      })
    })

    it('should handle health endpoint with no authentication', async () => {
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN
      delete process.env.GITHUB_TOKEN
      delete process.env.GITHUB_CLIENT_ID
      delete process.env.GITHUB_CLIENT_SECRET

      await githubOAuthTestPlugin(mockContext)

      const healthHandler = mockApp.get.mock.calls.find(call => call[0] === '/github/health')[1]

      const mockResponse = { json: vi.fn() }
      await healthHandler(mockResponse)

      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'ok',
        plugin: 'github-oauth-test',
        authentication: {
          required: true,
          configured: false,
        },
        timestamp: expect.any(String),
      })
    })
  })

  describe('Environment Variable Handling', () => {
    it('should prioritize GITHUB_PERSONAL_ACCESS_TOKEN', async () => {
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'personal-token'
      process.env.GITHUB_TOKEN = 'generic-token'

      await githubOAuthTestPlugin(mockContext)

      const userToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_user'
      )[2]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: 'testuser' }),
      } as Response)

      await userToolHandler({}, {})

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token personal-token',
          }),
        })
      )
    })

    it('should fall back to GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN
      process.env.GITHUB_TOKEN = 'generic-token'

      await githubOAuthTestPlugin(mockContext)

      const userToolHandler = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'github_user'
      )[2]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: 'testuser' }),
      } as Response)

      await userToolHandler({}, {})

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token generic-token',
          }),
        })
      )
    })
  })
})
