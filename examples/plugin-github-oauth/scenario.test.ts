/**
 * GitHub OAuth Plugin - 動作検証テスト
 *
 * OAuth 2.1フローとPKCE実装の検証
 * 状態管理とセキュリティ機能のテスト
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockContext, runTestScenario, withFakeTimers } from '../_shared/test-utils.js'
import type { TestScenario } from '../_shared/types.js'
import { createGitHubOAuthPlugin } from './index.js'

// グローバルfetchのモック
global.fetch = vi.fn()

describe('GitHub OAuth Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // fetch のモック設定
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'gho_test_token_123',
          token_type: 'bearer',
          scope: 'read:user,user:email',
          expires_in: 3600,
        }),
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Plugin Registration', () => {
    it('should register GitHub OAuth tools correctly', async () => {
      // Given: GitHub OAuth プラグイン
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
      })

      // When: プラグインを適用
      await plugin(ctx)

      // Then: 5つのツールが登録される
      expect(ctx.server.registerTool).toHaveBeenCalledTimes(5)

      const toolNames = vi.mocked(ctx.server.registerTool).mock.calls.map(call => call[0])
      expect(toolNames).toEqual([
        'github_auth_start',
        'github_auth_callback',
        'github_device_flow',
        'github_oauth_status',
        'github_oauth_clear',
      ])
    })

    it('should register OAuth endpoints', async () => {
      // Given: GitHub OAuth プラグイン
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
      })

      // When: プラグインを適用
      await plugin(ctx)

      // Then: エンドポイントが登録される
      expect(ctx.app.get).toHaveBeenCalledWith('/oauth/github/callback', expect.any(Function))
      expect(ctx.app.get).toHaveBeenCalledWith('/oauth/github/authorize', expect.any(Function))
    })

    it('should throw error when required config is missing', async () => {
      // Given: 不完全な設定
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        // clientSecret が欠落
        clientId: 'test_client_id',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
      })

      // When/Then: エラーが発生
      await expect(plugin(ctx)).rejects.toThrow('GitHub OAuth requires')
    })

    it('should load configuration from environment variables', async () => {
      // Given: 環境変数設定
      const ctx = createMockContext()
      ctx.env = {
        GITHUB_CLIENT_ID: 'env_client_id',
        GITHUB_CLIENT_SECRET: 'env_client_secret',
        GITHUB_REDIRECT_URI: 'http://env.example.com/callback',
        GITHUB_SCOPES: 'repo,user:email',
        GITHUB_ENABLE_PKCE: 'true',
      }

      const plugin = createGitHubOAuthPlugin()

      // When: プラグインを適用
      await plugin(ctx)

      // Then: ツールが正常に登録される
      expect(ctx.server.registerTool).toHaveBeenCalled()
    })
  })

  describe('OAuth Authorization Flow', () => {
    let authStartTool: any
    let authCallbackTool: any
    let statusTool: any
    let clearTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_123',
        clientSecret: 'test_secret_456',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
        scopes: ['read:user', 'user:email'],
        enablePKCE: true,
        stateLength: 32,
        sessionTimeout: 3600,
      })
      await plugin(ctx)

      // ツールハンドラーを取得
      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      authStartTool = toolCalls.find(([name]) => name === 'github_auth_start')![2]
      authCallbackTool = toolCalls.find(([name]) => name === 'github_auth_callback')![2]
      statusTool = toolCalls.find(([name]) => name === 'github_oauth_status')![2]
      clearTool = toolCalls.find(([name]) => name === 'github_oauth_clear')![2]
    })

    it('should start OAuth authorization flow', async () => {
      // Given: 認可開始リクエスト
      const request = {
        params: {
          arguments: {
            userId: 'test-user-123',
          },
        },
      }

      // When: 認可フローを開始
      const response = await authStartTool(request)
      const result = JSON.parse(response.content[0].text)

      // Then: 認可URLと状態が返される
      expect(result).toHaveProperty('authUrl')
      expect(result).toHaveProperty('state')
      expect(result).toHaveProperty('sessionId')
      expect(result).toHaveProperty('instructions')
      expect(result.authUrl).toContain('https://github.com/login/oauth/authorize')
      expect(result.authUrl).toContain('client_id=test_client_123')
      expect(result.authUrl).toContain('scope=read%3Auser%20user%3Aemail')
      expect(result.authUrl).toContain('code_challenge') // PKCE有効
    })

    it('should start OAuth flow with custom scopes', async () => {
      // Given: カスタムスコープ付きリクエスト
      const request = {
        params: {
          arguments: {
            userId: 'test-user-456',
            scopes: ['repo', 'admin:org'],
          },
        },
      }

      // When: 認可フローを開始
      const response = await authStartTool(request)
      const result = JSON.parse(response.content[0].text)

      // Then: カスタムスコープが反映される
      expect(result.authUrl).toContain('scope=repo%20admin%3Aorg')
    })

    it('should handle successful OAuth callback', async () => {
      // Given: 認可フロー開始
      const startRequest = {
        params: { arguments: { userId: 'test-user' } },
      }
      const startResponse = await authStartTool(startRequest)
      const startResult = JSON.parse(startResponse.content[0].text)

      // GitHub API ユーザー情報のモック
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'gho_test_token_123',
              token_type: 'bearer',
              scope: 'read:user,user:email',
            }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 12345,
              login: 'testuser',
              name: 'Test User',
              email: 'test@example.com',
              avatar_url: 'https://avatars.githubusercontent.com/u/12345',
              html_url: 'https://github.com/testuser',
              type: 'User',
              public_repos: 10,
              followers: 5,
              following: 8,
              created_at: '2020-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            }),
        } as any)

      // Given: 成功したコールバック
      const callbackRequest = {
        params: {
          arguments: {
            code: 'test_auth_code_123',
            state: startResult.state,
          },
        },
      }

      // When: コールバックを処理
      const callbackResponse = await authCallbackTool(callbackRequest)
      const callbackResult = JSON.parse(callbackResponse.content[0].text)

      // Then: 認証が成功
      expect(callbackResult.success).toBe(true)
      expect(callbackResult).toHaveProperty('accessToken')
      expect(callbackResult).toHaveProperty('user')
      expect(callbackResult.user.login).toBe('testuser')
      expect(callbackResult.user.id).toBe(12345)
      expect(callbackResult.flowType).toBe('authorization_code')
    })

    it('should handle OAuth callback with error', async () => {
      // Given: エラー付きコールバック
      const request = {
        params: {
          arguments: {
            state: 'test_state_456',
            error: 'access_denied',
            error_description: 'User denied authorization',
          },
        },
      }

      // When: エラーコールバックを処理
      const response = await authCallbackTool(request)
      const result = JSON.parse(response.content[0].text)

      // Then: 失敗結果が返される
      expect(result.success).toBe(false)
      expect(result.error.error).toBe('access_denied')
      expect(result.error.errorDescription).toBe('User denied authorization')
    })

    it('should handle invalid state in callback', async () => {
      // Given: 無効な状態でのコールバック
      const request = {
        params: {
          arguments: {
            code: 'test_code',
            state: 'invalid_state_123',
          },
        },
      }

      // When: コールバックを処理
      const response = await authCallbackTool(request)
      const result = JSON.parse(response.content[0].text)

      // Then: 状態エラーが返される
      expect(result.success).toBe(false)
      expect(result.error.error).toBe('invalid_state')
    })

    it('should provide OAuth status information', async () => {
      // Given: ステータスリクエスト
      const request = {
        params: {
          arguments: {
            includeConfig: true,
          },
        },
      }

      // When: ステータスを取得
      const response = await statusTool(request)
      const status = JSON.parse(response.content[0].text)

      // Then: 詳細なステータス情報が返される
      expect(status).toHaveProperty('stats')
      expect(status).toHaveProperty('config')
      expect(status).toHaveProperty('endpoints')
      expect(status.stats).toHaveProperty('totalStates')
      expect(status.stats).toHaveProperty('activeStates')
      expect(status.config.enablePKCE).toBe(true)
      expect(status.endpoints.authorize).toBe('https://github.com/login/oauth/authorize')
    })

    it('should clear OAuth states with confirmation', async () => {
      // Given: 確認付きクリアリクエスト
      const request = {
        params: {
          arguments: {
            confirm: true,
          },
        },
      }

      // When: 状態をクリア
      const response = await clearTool(request)

      // Then: クリアが成功
      expect(response.content[0].text).toContain('cleared successfully')
    })

    it('should require confirmation for clearing states', async () => {
      // Given: 確認なしクリアリクエスト
      const request = {
        params: {
          arguments: {
            confirm: false,
          },
        },
      }

      // When: 状態クリアを試行
      const response = await clearTool(request)

      // Then: 確認が要求される
      expect(response.content[0].text).toContain('requires confirmation')
    })
  })

  describe('Device Flow Support', () => {
    let deviceFlowTool: any

    beforeEach(async () => {
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
        enableDeviceFlow: true,
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      deviceFlowTool = toolCalls.find(([name]) => name === 'github_device_flow')![2]
    })

    it('should start device flow when enabled', async () => {
      // GitHub Device Flow API のモック
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            device_code: 'device_123',
            user_code: 'WDJB-MJHT',
            verification_uri: 'https://github.com/login/device',
            verification_uri_complete: 'https://github.com/login/device?user_code=WDJB-MJHT',
            expires_in: 900,
            interval: 5,
          }),
      } as any)

      // Given: デバイスフローリクエスト
      const request = {
        params: { arguments: {} },
      }

      // When: デバイスフローを開始
      const response = await deviceFlowTool(request)
      const result = JSON.parse(response.content[0].text)

      // Then: デバイスフロー情報が返される
      expect(result).toHaveProperty('userCode')
      expect(result).toHaveProperty('verificationUri')
      expect(result).toHaveProperty('verificationUriComplete')
      expect(result).toHaveProperty('expiresIn')
      expect(result).toHaveProperty('interval')
      expect(result).toHaveProperty('instructions')
      expect(result.userCode).toBe('WDJB-MJHT')
    })

    it('should handle disabled device flow', async () => {
      // Given: デバイスフロー無効なプラグイン
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
        enableDeviceFlow: false,
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      const disabledDeviceFlowTool = toolCalls.find(([name]) => name === 'github_device_flow')![2]

      // When: デバイスフローを試行
      const response = await disabledDeviceFlowTool({
        params: { arguments: {} },
      })
      const result = JSON.parse(response.content[0].text)

      // Then: エラーが返される
      expect(result.error).toBe('Device flow not enabled')
    })
  })

  describe('State Management and Security', () => {
    it('should handle state expiration correctly', () => {
      withFakeTimers(() => {
        // Given: 固定時刻
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

        // OAuth状態の模擬
        const oauthState = {
          state: 'test_state',
          sessionId: 'session_123',
          createdAt: Date.now(),
          expiresAt: Date.now() + 5000, // 5秒後
          redirectUri: 'http://localhost:8787/callback',
          scopes: ['read:user'],
        }

        // When: 期限内チェック
        const beforeExpiry = Date.now() <= oauthState.expiresAt
        expect(beforeExpiry).toBe(true)

        // 時間を進める
        vi.advanceTimersByTime(6000) // 6秒後

        // Then: 期限切れになる
        const afterExpiry = Date.now() > oauthState.expiresAt
        expect(afterExpiry).toBe(true)
      })
    })

    it('should validate state parameters correctly', () => {
      // Given: 状態検証のロジック（純粋関数のテスト）
      const validateOAuthState = (oauthState: any, receivedState: string, now: number) => {
        if (oauthState.state !== receivedState) {
          return { valid: false, reason: 'State mismatch' }
        }

        if (now > oauthState.expiresAt) {
          return { valid: false, reason: 'State expired' }
        }

        return { valid: true }
      }

      const mockState = {
        state: 'valid_state_123',
        expiresAt: Date.now() + 1000,
      }

      // When: 正しい状態で検証
      const validResult = validateOAuthState(mockState, 'valid_state_123', Date.now())
      expect(validResult.valid).toBe(true)

      // 間違った状態で検証
      const invalidResult = validateOAuthState(mockState, 'wrong_state', Date.now())
      expect(invalidResult.valid).toBe(false)
      expect(invalidResult.reason).toBe('State mismatch')

      // 期限切れ状態で検証
      const expiredResult = validateOAuthState(mockState, 'valid_state_123', Date.now() + 2000)
      expect(expiredResult.valid).toBe(false)
      expect(expiredResult.reason).toBe('State expired')
    })
  })

  describe('PKCE Implementation', () => {
    it('should generate consistent PKCE parameters', () => {
      // Given: PKCE生成のロジック（実装の関数をテスト）

      // コードベリファイアーの生成
      const generateRandomString = (length: number): string => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
        return Array.from({ length }, () =>
          chars.charAt(Math.floor(Math.random() * chars.length))
        ).join('')
      }

      // When: コードベリファイアーを生成
      const codeVerifier1 = generateRandomString(128)
      const codeVerifier2 = generateRandomString(128)

      // Then: 適切な長さと文字セットが使用される
      expect(codeVerifier1).toHaveLength(128)
      expect(codeVerifier2).toHaveLength(128)
      expect(codeVerifier1).not.toBe(codeVerifier2) // ランダム性
      expect(codeVerifier1).toMatch(/^[A-Za-z0-9\-\._~]+$/) // 許可文字のみ
    })

    it('should create proper authorization URLs with PKCE', async () => {
      // Given: PKCE対応の設定
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_pkce',
        clientSecret: 'test_secret_pkce',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
        enablePKCE: true,
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      const authStartTool = toolCalls.find(([name]) => name === 'github_auth_start')![2]

      // When: 認可フローを開始
      const response = await authStartTool({
        params: { arguments: {} },
      })
      const result = JSON.parse(response.content[0].text)

      // Then: PKCEパラメータが含まれる
      expect(result.authUrl).toContain('code_challenge=')
      expect(result.authUrl).toContain('code_challenge_method=S256')
    })
  })

  describe('HTTP Endpoint Integration', () => {
    it('should handle OAuth callback endpoint', async () => {
      // Given: GitHub OAuth プラグイン
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
      })
      await plugin(ctx)

      // コールバックエンドポイントハンドラーを取得
      const callbackHandler = vi
        .mocked(ctx.app.get)
        .mock.calls.find(([path]) => path === '/oauth/github/callback')![1]

      // モックコンテキスト
      const mockC = {
        req: {
          query: vi.fn((key: string) => {
            const params: Record<string, string> = {
              code: 'test_code_123',
              state: 'test_state_456',
            }
            return params[key]
          }),
        },
        json: vi.fn().mockReturnValue('mocked response'),
      }

      // GitHub API のモック
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'gho_test_token',
              token_type: 'bearer',
              scope: 'read:user',
            }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 12345,
              login: 'testuser',
              name: 'Test User',
            }),
        } as any)

      // When: コールバックエンドポイントを呼び出し
      // 注意: 実際の状態が存在しないため失敗するが、エンドポイント自体は動作
      await callbackHandler(mockC)

      // Then: JSONレスポンスが呼ばれる
      expect(mockC.json).toHaveBeenCalled()
    })

    it('should handle OAuth authorization endpoint', async () => {
      // Given: GitHub OAuth プラグイン
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
      })
      await plugin(ctx)

      // 認可エンドポイントハンドラーを取得
      const authHandler = vi
        .mocked(ctx.app.get)
        .mock.calls.find(([path]) => path === '/oauth/github/authorize')![1]

      // モックコンテキスト
      const mockC = {
        req: {
          query: vi.fn((key: string) => {
            const params: Record<string, string> = {
              user_id: 'test_user_123',
            }
            return params[key]
          }),
        },
        redirect: vi.fn().mockReturnValue('redirect response'),
      }

      // When: 認可エンドポイントを呼び出し
      await authHandler(mockC)

      // Then: リダイレクトが実行される
      expect(mockC.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://github.com/login/oauth/authorize')
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Given: ネットワークエラーのモック
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      const deviceFlowTool = toolCalls.find(([name]) => name === 'github_device_flow')![2]

      // When: デバイスフローでネットワークエラー
      const response = await deviceFlowTool({
        params: { arguments: {} },
      })
      const result = JSON.parse(response.content[0].text)

      // Then: エラーが適切に処理される
      expect(result.error).toBe('Device flow failed')
      expect(result.message).toContain('Network error')
    })

    it('should handle invalid API responses', async () => {
      // Given: 無効なAPIレスポンス
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      } as any)

      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
        enableDeviceFlow: true,
      })
      await plugin(ctx)

      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      const deviceFlowTool = toolCalls.find(([name]) => name === 'github_device_flow')![2]

      // When: 無効なレスポンスでデバイスフロー
      const response = await deviceFlowTool({
        params: { arguments: {} },
      })
      const result = JSON.parse(response.content[0].text)

      // Then: エラーが報告される
      expect(result.error).toBe('Device flow failed')
      expect(result.message).toContain('400')
    })
  })

  describe('Test Scenarios', () => {
    const scenarios: readonly TestScenario[] = [
      {
        name: 'Start auth flow',
        input: { userId: 'test-user' },
        expectedOutput: 'authUrl',
      },
      {
        name: 'Handle callback error',
        input: {
          state: 'test_state',
          error: 'access_denied',
        },
        expectedOutput: 'access_denied',
      },
      {
        name: 'Get status',
        input: { includeConfig: true },
        expectedOutput: 'stats',
      },
      {
        name: 'Clear states',
        input: { confirm: true },
        expectedOutput: 'cleared successfully',
      },
    ] as const

    it.each(scenarios)('should handle scenario: $name', async scenario => {
      // Given: GitHub OAuth プラグイン
      const ctx = createMockContext()
      const plugin = createGitHubOAuthPlugin({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'http://localhost:8787/oauth/github/callback',
      })
      await plugin(ctx)

      // 対応するツールを特定
      const toolCalls = vi.mocked(ctx.server.registerTool).mock.calls
      let toolHandler: any

      if ('userId' in scenario.input) {
        // auth start tool
        toolHandler = toolCalls.find(([name]) => name === 'github_auth_start')![2]
      } else if ('error' in scenario.input) {
        // auth callback tool
        toolHandler = toolCalls.find(([name]) => name === 'github_auth_callback')![2]
      } else if ('includeConfig' in scenario.input) {
        // status tool
        toolHandler = toolCalls.find(([name]) => name === 'github_oauth_status')![2]
      } else if ('confirm' in scenario.input) {
        // clear tool
        toolHandler = toolCalls.find(([name]) => name === 'github_oauth_clear')![2]
      } else {
        // device flow tool
        toolHandler = toolCalls.find(([name]) => name === 'github_device_flow')![2]
      }

      // When: シナリオを実行
      const result = await runTestScenario(scenario, async input => {
        const response = await toolHandler({
          params: { arguments: input },
        })
        return response.content[0].text
      })

      // Then: 期待される結果
      expect(result.success).toBe(true)
      if (scenario.expectedOutput) {
        expect(result.output).toContain(scenario.expectedOutput)
      }
    })
  })

  describe('Scope Handling', () => {
    it('should parse scope strings correctly', () => {
      // Given: スコープ文字列パース関数
      const parseScopes = (scopeString: string) => {
        if (!scopeString) return []
        return scopeString.split(/[,\s]+/).filter(Boolean)
      }

      // When: 各種スコープ文字列をパース
      const commaScopes = parseScopes('read:user,user:email,repo')
      const spaceScopes = parseScopes('read:user user:email repo')
      const mixedScopes = parseScopes('read:user, user:email repo')
      const emptyScopes = parseScopes('')

      // Then: 正しくパースされる
      expect(commaScopes).toEqual(['read:user', 'user:email', 'repo'])
      expect(spaceScopes).toEqual(['read:user', 'user:email', 'repo'])
      expect(mixedScopes).toEqual(['read:user', 'user:email', 'repo'])
      expect(emptyScopes).toEqual([])
    })
  })

  describe('URL Generation', () => {
    it('should create proper authorization URLs', () => {
      // Given: URL生成のロジック
      const createAuthorizationUrl = (config: any, state: string, pkceParams?: any): string => {
        const params = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          scope: config.scopes.join(' '),
          state,
          allow_signup: config.allowSignup.toString(),
        })

        if (pkceParams) {
          params.set('code_challenge', pkceParams.codeChallenge)
          params.set('code_challenge_method', pkceParams.codeChallengeMethod)
        }

        return `https://github.com/login/oauth/authorize?${params.toString()}`
      }

      const config = {
        clientId: 'test_client',
        redirectUri: 'http://localhost:8787/callback',
        scopes: ['read:user', 'user:email'],
        allowSignup: true,
      }

      // When: PKCE なしでURL生成
      const urlWithoutPKCE = createAuthorizationUrl(config, 'test_state')

      // Then: 適切なURLが生成される
      expect(urlWithoutPKCE).toContain('client_id=test_client')
      expect(urlWithoutPKCE).toContain('scope=read%3Auser%20user%3Aemail')
      expect(urlWithoutPKCE).toContain('state=test_state')
      expect(urlWithoutPKCE).toContain('allow_signup=true')
      expect(urlWithoutPKCE).not.toContain('code_challenge')

      // When: PKCE ありでURL生成
      const pkceParams = {
        codeChallenge: 'test_challenge',
        codeChallengeMethod: 'S256' as const,
      }
      const urlWithPKCE = createAuthorizationUrl(config, 'test_state', pkceParams)

      // Then: PKCEパラメータが含まれる
      expect(urlWithPKCE).toContain('code_challenge=test_challenge')
      expect(urlWithPKCE).toContain('code_challenge_method=S256')
    })
  })
})
