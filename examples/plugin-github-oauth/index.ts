/**
 * GitHub OAuth Plugin Example - 関数型OAuth 2.1実装
 *
 * PKCE対応のGitHub OAuth統合
 * 純粋関数によるOAuthフローと状態管理
 */

import type { HatagoPlugin } from '@hatago/core'
import type { ExampleConfig, TestScenario } from '../_shared/types.js'

// ===== 型定義（不変データ構造） =====

/**
 * GitHub OAuth設定
 */
interface GitHubOAuthConfig {
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  readonly scopes: readonly GitHubScope[]
  readonly allowSignup: boolean
  readonly enablePKCE: boolean
  readonly stateLength: number
  readonly codeVerifierLength: number
  readonly sessionTimeout: number
  readonly enableWebhooks: boolean
  readonly enableDeviceFlow: boolean
}

/**
 * GitHub OAuth スコープ
 */
type GitHubScope =
  | 'repo'
  | 'repo:status'
  | 'repo_deployment'
  | 'public_repo'
  | 'repo:invite'
  | 'security_events'
  | 'admin:repo_hook'
  | 'write:repo_hook'
  | 'read:repo_hook'
  | 'admin:org'
  | 'write:org'
  | 'read:org'
  | 'admin:public_key'
  | 'write:public_key'
  | 'read:public_key'
  | 'admin:org_hook'
  | 'gist'
  | 'notifications'
  | 'user'
  | 'read:user'
  | 'user:email'
  | 'user:follow'
  | 'delete_repo'
  | 'write:discussion'
  | 'read:discussion'
  | 'admin:enterprise'
  | 'manage_billing:enterprise'
  | 'read:enterprise'
  | 'codespace'

/**
 * OAuth状態（不変）
 */
interface OAuthState {
  readonly state: string
  readonly codeVerifier?: string
  readonly codeChallenge?: string
  readonly redirectUri: string
  readonly scopes: readonly GitHubScope[]
  readonly createdAt: number
  readonly expiresAt: number
  readonly userId?: string
  readonly sessionId: string
}

/**
 * アクセストークン情報
 */
interface GitHubAccessToken {
  readonly accessToken: string
  readonly tokenType: string
  readonly scope: readonly GitHubScope[]
  readonly refreshToken?: string
  readonly expiresIn?: number
  readonly refreshTokenExpiresIn?: number
  readonly issuedAt: number
}

/**
 * GitHub ユーザー情報
 */
interface GitHubUser {
  readonly id: number
  readonly login: string
  readonly name?: string
  readonly email?: string
  readonly avatarUrl: string
  readonly htmlUrl: string
  readonly type: 'User' | 'Organization'
  readonly bio?: string
  readonly company?: string
  readonly location?: string
  readonly blog?: string
  readonly twitterUsername?: string
  readonly publicRepos: number
  readonly publicGists: number
  readonly followers: number
  readonly following: number
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * OAuth フロー結果
 */
interface OAuthFlowResult {
  readonly success: boolean
  readonly accessToken?: GitHubAccessToken
  readonly user?: GitHubUser
  readonly error?: OAuthError
  readonly state: string
  readonly flowType: OAuthFlowType
}

/**
 * OAuth エラー
 */
interface OAuthError {
  readonly error: string
  readonly errorDescription?: string
  readonly errorUri?: string
  readonly state?: string
}

/**
 * OAuth フロー種別
 */
type OAuthFlowType = 'authorization_code' | 'device_flow' | 'refresh_token'

/**
 * デバイスフロー情報
 */
interface DeviceFlowInfo {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUri: string
  readonly verificationUriComplete: string
  readonly expiresIn: number
  readonly interval: number
  readonly createdAt: number
}

/**
 * PKCE パラメータ
 */
interface PKCEParams {
  readonly codeVerifier: string
  readonly codeChallenge: string
  readonly codeChallengeMethod: 'S256'
}

// ===== 純粋関数群 =====

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: Partial<GitHubOAuthConfig> = {
  scopes: ['read:user', 'user:email'],
  allowSignup: true,
  enablePKCE: true,
  stateLength: 32,
  codeVerifierLength: 128,
  sessionTimeout: 3600,
  enableWebhooks: false,
  enableDeviceFlow: false,
} as const

/**
 * 環境変数からの設定読み込み（純粋関数）
 */
const loadConfigFromEnv = (env: Record<string, string | undefined>): Partial<GitHubOAuthConfig> => {
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    redirectUri: env.GITHUB_REDIRECT_URI,
    scopes: env.GITHUB_SCOPES
      ? env.GITHUB_SCOPES.split(',').map(s => s.trim() as GitHubScope)
      : undefined,
    allowSignup: env.GITHUB_ALLOW_SIGNUP !== 'false',
    enablePKCE: env.GITHUB_ENABLE_PKCE !== 'false',
    sessionTimeout: env.GITHUB_SESSION_TIMEOUT
      ? Number.parseInt(env.GITHUB_SESSION_TIMEOUT, 10)
      : undefined,
  }
}

/**
 * ランダム文字列生成（純粋関数）
 */
const generateRandomString = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join(
    ''
  )
}

/**
 * Base64URL エンコード（純粋関数）
 */
const base64URLEncode = (str: string): string => {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * SHA256ハッシュ（純粋関数 - 実際の実装ではWebCrypto APIを使用）
 */
const sha256Hash = async (input: string): Promise<string> => {
  // ブラウザ環境でのWebCrypto API使用例
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = new Uint8Array(hashBuffer)
    return String.fromCharCode(...hashArray)
  }

  // Node.js環境やフォールバック（モック実装）
  return base64URLEncode(input.split('').reverse().join(''))
}

/**
 * PKCE パラメータ生成（純粋関数）
 */
const generatePKCEParams = async (codeVerifierLength: number): Promise<PKCEParams> => {
  const codeVerifier = generateRandomString(codeVerifierLength)
  const challengeHash = await sha256Hash(codeVerifier)
  const codeChallenge = base64URLEncode(challengeHash)

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  }
}

/**
 * OAuth認可URL生成（純粋関数）
 */
const createAuthorizationUrl = (
  config: GitHubOAuthConfig,
  state: string,
  pkceParams?: PKCEParams
): string => {
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

/**
 * アクセストークン交換（純粋関数での構造化）
 */
const createTokenExchangeRequest = (
  config: GitHubOAuthConfig,
  code: string,
  state: string,
  codeVerifier?: string
): {
  url: string
  method: string
  headers: Record<string, string>
  body: string
} => {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    state,
  })

  if (codeVerifier) {
    params.set('code_verifier', codeVerifier)
  }

  return {
    url: 'https://github.com/login/oauth/access_token',
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Hatago-GitHub-OAuth/1.0',
    },
    body: params.toString(),
  }
}

/**
 * GitHub API リクエスト構造化（純粋関数）
 */
const createGitHubAPIRequest = (
  endpoint: string,
  accessToken: string,
  method = 'GET'
): {
  url: string
  method: string
  headers: Record<string, string>
} => ({
  url: `https://api.github.com${endpoint}`,
  method,
  headers: {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Hatago-GitHub-OAuth/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  },
})

/**
 * OAuth状態の検証（純粋関数）
 */
const validateOAuthState = (
  oauthState: OAuthState,
  receivedState: string,
  now: number
): { valid: boolean; reason?: string } => {
  if (oauthState.state !== receivedState) {
    return { valid: false, reason: 'State mismatch' }
  }

  if (now > oauthState.expiresAt) {
    return { valid: false, reason: 'State expired' }
  }

  return { valid: true }
}

/**
 * スコープ文字列のパース（純粋関数）
 */
const parseScopes = (scopeString: string): readonly GitHubScope[] => {
  if (!scopeString) return []
  return scopeString.split(/[,\s]+/).filter(Boolean) as GitHubScope[]
}

/**
 * エラーレスポンスの検証（純粋関数）
 */
const _parseOAuthError = (params: URLSearchParams): OAuthError | null => {
  const error = params.get('error')
  if (!error) return null

  return {
    error,
    errorDescription: params.get('error_description') || undefined,
    errorUri: params.get('error_uri') || undefined,
    state: params.get('state') || undefined,
  }
}

// ===== 状態管理クラス =====

/**
 * OAuth状態管理クラス
 */
class OAuthStateManager {
  private states = new Map<string, OAuthState>()
  private readonly config: GitHubOAuthConfig

  constructor(config: GitHubOAuthConfig) {
    this.config = config

    // 定期的な期限切れ状態のクリーンアップ
    setInterval(() => this.cleanup(), 300000) // 5分間隔
  }

  /**
   * 新しいOAuth状態の作成
   */
  async createState(
    userId?: string,
    customScopes?: readonly GitHubScope[]
  ): Promise<{ state: OAuthState; authUrl: string }> {
    const state = generateRandomString(this.config.stateLength)
    const sessionId = generateRandomString(16)
    const now = Date.now()

    let pkceParams: PKCEParams | undefined
    if (this.config.enablePKCE) {
      pkceParams = await generatePKCEParams(this.config.codeVerifierLength)
    }

    const oauthState: OAuthState = {
      state,
      codeVerifier: pkceParams?.codeVerifier,
      codeChallenge: pkceParams?.codeChallenge,
      redirectUri: this.config.redirectUri,
      scopes: customScopes || this.config.scopes,
      createdAt: now,
      expiresAt: now + this.config.sessionTimeout * 1000,
      userId,
      sessionId,
    }

    this.states.set(state, oauthState)

    const authUrl = createAuthorizationUrl(
      { ...this.config, scopes: oauthState.scopes },
      state,
      pkceParams
    )

    return { state: oauthState, authUrl }
  }

  /**
   * OAuth状態の取得と削除
   */
  consumeState(state: string): OAuthState | null {
    const oauthState = this.states.get(state)
    if (!oauthState) return null

    this.states.delete(state)
    return oauthState
  }

  /**
   * 状態の検証
   */
  validateState(state: string, now: number): { valid: boolean; reason?: string } {
    const oauthState = this.states.get(state)
    if (!oauthState) {
      return { valid: false, reason: 'State not found' }
    }

    return validateOAuthState(oauthState, state, now)
  }

  /**
   * 期限切れ状態のクリーンアップ
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [state, oauthState] of this.states) {
      if (now > oauthState.expiresAt) {
        this.states.delete(state)
      }
    }
  }

  /**
   * 統計情報の取得
   */
  getStats(): { totalStates: number; activeStates: number } {
    const now = Date.now()
    const activeStates = Array.from(this.states.values()).filter(
      state => now <= state.expiresAt
    ).length

    return {
      totalStates: this.states.size,
      activeStates,
    }
  }

  /**
   * 全ての状態をクリア
   */
  clearAll(): void {
    this.states.clear()
  }
}

// ===== GitHub OAuth ハンドラー =====

/**
 * GitHub OAuth ハンドラークラス
 */
class GitHubOAuthHandler {
  private readonly config: GitHubOAuthConfig
  private readonly stateManager: OAuthStateManager

  constructor(config: GitHubOAuthConfig) {
    this.config = config
    this.stateManager = new OAuthStateManager(config)
  }

  /**
   * OAuth認可フローの開始
   */
  async startAuthFlow(
    userId?: string,
    customScopes?: readonly GitHubScope[]
  ): Promise<{ authUrl: string; state: string; sessionId: string }> {
    const { state, authUrl } = await this.stateManager.createState(userId, customScopes)

    return {
      authUrl,
      state: state.state,
      sessionId: state.sessionId,
    }
  }

  /**
   * OAuth認可コードの処理
   */
  async handleCallback(
    code: string,
    state: string,
    receivedError?: OAuthError
  ): Promise<OAuthFlowResult> {
    if (receivedError) {
      return {
        success: false,
        error: receivedError,
        state,
        flowType: 'authorization_code',
      }
    }

    // 状態の検証と取得
    const oauthState = this.stateManager.consumeState(state)
    if (!oauthState) {
      return {
        success: false,
        error: {
          error: 'invalid_state',
          errorDescription: 'Invalid or expired state parameter',
        },
        state,
        flowType: 'authorization_code',
      }
    }

    const stateValidation = validateOAuthState(oauthState, state, Date.now())
    if (!stateValidation.valid) {
      return {
        success: false,
        error: {
          error: 'invalid_state',
          errorDescription: stateValidation.reason,
        },
        state,
        flowType: 'authorization_code',
      }
    }

    try {
      // アクセストークンの取得
      const accessToken = await this.exchangeCodeForToken(code, state, oauthState.codeVerifier)

      // ユーザー情報の取得
      const user = await this.fetchUserInfo(accessToken.accessToken)

      return {
        success: true,
        accessToken,
        user,
        state,
        flowType: 'authorization_code',
      }
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'server_error',
          errorDescription: error instanceof Error ? error.message : 'Unknown error',
        },
        state,
        flowType: 'authorization_code',
      }
    }
  }

  /**
   * コードをアクセストークンに交換
   */
  private async exchangeCodeForToken(
    code: string,
    state: string,
    codeVerifier?: string
  ): Promise<GitHubAccessToken> {
    const request = createTokenExchangeRequest(this.config, code, state, codeVerifier)

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`OAuth error: ${data.error} - ${data.error_description}`)
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'bearer',
      scope: parseScopes(data.scope),
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      refreshTokenExpiresIn: data.refresh_token_expires_in,
      issuedAt: Date.now(),
    }
  }

  /**
   * GitHub ユーザー情報の取得
   */
  private async fetchUserInfo(accessToken: string): Promise<GitHubUser> {
    const request = createGitHubAPIRequest('/user', accessToken)

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
    })

    if (!response.ok) {
      throw new Error(`User info fetch failed: ${response.status} ${response.statusText}`)
    }

    const userData = await response.json()

    return {
      id: userData.id,
      login: userData.login,
      name: userData.name,
      email: userData.email,
      avatarUrl: userData.avatar_url,
      htmlUrl: userData.html_url,
      type: userData.type,
      bio: userData.bio,
      company: userData.company,
      location: userData.location,
      blog: userData.blog,
      twitterUsername: userData.twitter_username,
      publicRepos: userData.public_repos,
      publicGists: userData.public_gists,
      followers: userData.followers,
      following: userData.following,
      createdAt: userData.created_at,
      updatedAt: userData.updated_at,
    }
  }

  /**
   * デバイスフローの開始（GitHub App限定機能）
   */
  async startDeviceFlow(): Promise<DeviceFlowInfo | null> {
    if (!this.config.enableDeviceFlow) {
      return null
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: this.config.scopes.join(' '),
    })

    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error(`Device flow failed: ${response.status}`)
    }

    const data = await response.json()

    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval,
      createdAt: Date.now(),
    }
  }

  /**
   * リフレッシュトークンでアクセストークンを更新
   */
  async refreshAccessToken(refreshToken: string): Promise<GitHubAccessToken> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`OAuth refresh error: ${data.error}`)
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'bearer',
      scope: parseScopes(data.scope),
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      refreshTokenExpiresIn: data.refresh_token_expires_in,
      issuedAt: Date.now(),
    }
  }

  /**
   * 状態管理統計の取得
   */
  getStateStats() {
    return this.stateManager.getStats()
  }

  /**
   * 全状態のクリア
   */
  clearAllStates(): void {
    this.stateManager.clearAll()
  }
}

// ===== MCPツール実装 =====

/**
 * OAuth認可開始ツール
 */
const createGitHubAuthStartTool = (handler: GitHubOAuthHandler) => async (request: any) => {
  const {
    userId,
    scopes,
    customRedirectUri: _customRedirectUri,
  } = request.params.arguments as {
    userId?: string
    scopes?: GitHubScope[]
    customRedirectUri?: string
  }

  const result = await handler.startAuthFlow(userId, scopes)

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            authUrl: result.authUrl,
            state: result.state,
            sessionId: result.sessionId,
            instructions:
              'Redirect user to authUrl and handle callback with the authorization code',
          },
          null,
          2
        ),
      },
    ],
  }
}

/**
 * OAuth コールバック処理ツール
 */
const createGitHubAuthCallbackTool = (handler: GitHubOAuthHandler) => async (request: any) => {
  const { code, state, error, error_description, error_uri } = request.params.arguments as {
    code?: string
    state: string
    error?: string
    error_description?: string
    error_uri?: string
  }

  const oauthError = error
    ? {
        error,
        errorDescription: error_description,
        errorUri: error_uri,
      }
    : undefined

  const result = await handler.handleCallback(code || '', state, oauthError)

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: result.success,
            accessToken: result.accessToken
              ? {
                  tokenType: result.accessToken.tokenType,
                  scope: result.accessToken.scope,
                  expiresIn: result.accessToken.expiresIn,
                  // セキュリティのため実際のトークンは返さない
                  tokenLength: result.accessToken.accessToken.length,
                }
              : undefined,
            user: result.user,
            error: result.error,
            flowType: result.flowType,
          },
          null,
          2
        ),
      },
    ],
  }
}

/**
 * デバイスフロー開始ツール
 */
const createGitHubDeviceFlowTool = (handler: GitHubOAuthHandler) => async (_request: any) => {
  try {
    const deviceFlow = await handler.startDeviceFlow()

    if (!deviceFlow) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Device flow not enabled',
              },
              null,
              2
            ),
          },
        ],
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              userCode: deviceFlow.userCode,
              verificationUri: deviceFlow.verificationUri,
              verificationUriComplete: deviceFlow.verificationUriComplete,
              expiresIn: deviceFlow.expiresIn,
              interval: deviceFlow.interval,
              instructions: 'User should visit verificationUri and enter userCode',
            },
            null,
            2
          ),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'Device flow failed',
              message: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          ),
        },
      ],
    }
  }
}

/**
 * OAuth 状態管理ツール
 */
const createGitHubOAuthStatusTool = (handler: GitHubOAuthHandler) => async (request: any) => {
  const { includeConfig = false } = request.params.arguments as {
    includeConfig?: boolean
  }

  const stats = handler.getStateStats()
  const configInfo = includeConfig
    ? {
        scopes: handler.config.scopes,
        enablePKCE: handler.config.enablePKCE,
        allowSignup: handler.config.allowSignup,
        sessionTimeout: handler.config.sessionTimeout,
        enableDeviceFlow: handler.config.enableDeviceFlow,
      }
    : undefined

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            stats,
            config: configInfo,
            endpoints: {
              authorize: 'https://github.com/login/oauth/authorize',
              token: 'https://github.com/login/oauth/access_token',
              device: 'https://github.com/login/device/code',
              revoke: 'https://github.com/settings/connections/applications',
            },
          },
          null,
          2
        ),
      },
    ],
  }
}

/**
 * OAuth 状態クリアツール
 */
const createGitHubOAuthClearTool = (handler: GitHubOAuthHandler) => async (request: any) => {
  const { confirm = false } = request.params.arguments as {
    confirm?: boolean
  }

  if (!confirm) {
    return {
      content: [
        {
          type: 'text',
          text: 'Operation requires confirmation. Set confirm=true to proceed.',
        },
      ],
    }
  }

  handler.clearAllStates()

  return {
    content: [
      {
        type: 'text',
        text: 'All OAuth states have been cleared successfully',
      },
    ],
  }
}

// ===== プラグイン実装 =====

/**
 * GitHub OAuth プラグインの作成
 */
export const createGitHubOAuthPlugin = (
  userConfig: Partial<GitHubOAuthConfig> = {}
): HatagoPlugin => {
  return async ctx => {
    // 設定の合成
    const envConfig = loadConfigFromEnv(ctx.env || {})
    const config: GitHubOAuthConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      ...envConfig,
    } as GitHubOAuthConfig

    // 必須設定の検証
    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      throw new Error('GitHub OAuth requires clientId, clientSecret, and redirectUri')
    }

    // OAuth ハンドラー初期化
    const oauthHandler = new GitHubOAuthHandler(config)

    // OAuth コールバックエンドポイント
    ctx.app.get('/oauth/github/callback', async c => {
      const code = c.req.query('code')
      const state = c.req.query('state')
      const error = c.req.query('error')
      const errorDescription = c.req.query('error_description')

      if (!state) {
        return c.json({ error: 'Missing state parameter' }, 400)
      }

      const oauthError = error
        ? {
            error,
            errorDescription,
            errorUri: c.req.query('error_uri') || undefined,
          }
        : undefined

      const result = await oauthHandler.handleCallback(code || '', state, oauthError)

      if (result.success) {
        // 成功時は適切なページにリダイレクト
        return c.json({
          success: true,
          user: result.user,
          message: 'Authentication successful',
        })
      }
      return c.json(
        {
          success: false,
          error: result.error,
          message: 'Authentication failed',
        },
        400
      )
    })

    // OAuth 認可開始エンドポイント
    ctx.app.get('/oauth/github/authorize', async c => {
      const userId = c.req.query('user_id')
      const scopes = c.req.query('scopes')?.split(',') as GitHubScope[]

      const result = await oauthHandler.startAuthFlow(userId, scopes)

      return c.redirect(result.authUrl)
    })

    // MCPツール登録
    ctx.server.registerTool(
      'github_auth_start',
      {
        description: 'Start GitHub OAuth authorization flow',
        inputSchema: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'Optional user ID to associate with the auth flow',
            },
            scopes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Custom OAuth scopes (default: read:user, user:email)',
            },
          },
        },
      },
      createGitHubAuthStartTool(oauthHandler)
    )

    ctx.server.registerTool(
      'github_auth_callback',
      {
        description: 'Handle GitHub OAuth callback',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Authorization code from GitHub',
            },
            state: {
              type: 'string',
              description: 'State parameter from GitHub',
            },
            error: {
              type: 'string',
              description: 'Error code if authorization failed',
            },
            error_description: {
              type: 'string',
              description: 'Error description if authorization failed',
            },
            error_uri: {
              type: 'string',
              description: 'Error URI if authorization failed',
            },
          },
          required: ['state'],
        },
      },
      createGitHubAuthCallbackTool(oauthHandler)
    )

    ctx.server.registerTool(
      'github_device_flow',
      {
        description: 'Start GitHub OAuth device flow (for apps without browser)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      createGitHubDeviceFlowTool(oauthHandler)
    )

    ctx.server.registerTool(
      'github_oauth_status',
      {
        description: 'Get GitHub OAuth configuration and state statistics',
        inputSchema: {
          type: 'object',
          properties: {
            includeConfig: {
              type: 'boolean',
              description: 'Include configuration details',
              default: false,
            },
          },
        },
      },
      createGitHubOAuthStatusTool(oauthHandler)
    )

    ctx.server.registerTool(
      'github_oauth_clear',
      {
        description: 'Clear all OAuth states (for cleanup)',
        inputSchema: {
          type: 'object',
          properties: {
            confirm: {
              type: 'boolean',
              description: 'Confirmation required for safety',
              default: false,
            },
          },
          required: ['confirm'],
        },
      },
      createGitHubOAuthClearTool(oauthHandler)
    )
  }
}

// ===== テストシナリオ =====

const testScenarios: readonly TestScenario[] = [
  {
    name: 'Start OAuth flow',
    input: { userId: 'test-user' },
    expectedOutput: 'authUrl',
  },
  {
    name: 'Handle OAuth callback success',
    input: {
      code: 'test_auth_code_123',
      state: 'test_state_456',
    },
    expectedOutput: 'success',
  },
  {
    name: 'Handle OAuth callback error',
    input: {
      state: 'test_state_789',
      error: 'access_denied',
      error_description: 'User denied authorization',
    },
    expectedOutput: 'access_denied',
  },
  {
    name: 'Get OAuth status',
    input: { includeConfig: true },
    expectedOutput: 'stats',
  },
  {
    name: 'Start device flow',
    input: {},
    expectedOutput: 'userCode',
  },
  {
    name: 'Clear OAuth states',
    input: { confirm: true },
    expectedOutput: 'cleared successfully',
  },
] as const

// ===== 実行設定 =====

const config: ExampleConfig = {
  name: 'github-oauth',
  description: 'GitHub OAuth 2.1 integration with PKCE support and functional state management',
  plugin: createGitHubOAuthPlugin({
    clientId: 'test_client_id',
    clientSecret: 'test_client_secret',
    redirectUri: 'http://localhost:8787/oauth/github/callback',
    scopes: ['read:user', 'user:email', 'public_repo'],
    allowSignup: true,
    enablePKCE: true,
    stateLength: 32,
    codeVerifierLength: 128,
    sessionTimeout: 3600,
    enableWebhooks: false,
    enableDeviceFlow: false,
  }),
  testScenarios,
  env: {
    GITHUB_CLIENT_ID: 'test_client_id',
    GITHUB_CLIENT_SECRET: 'test_client_secret',
    GITHUB_REDIRECT_URI: 'http://localhost:8787/oauth/github/callback',
    GITHUB_SCOPES: 'read:user,user:email,public_repo',
    GITHUB_ENABLE_PKCE: 'true',
  },
} as const

export default config
