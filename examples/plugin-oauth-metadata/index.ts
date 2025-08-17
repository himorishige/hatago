/**
 * OAuth Metadata Plugin Example - 関数型認証・認可システム実装
 *
 * RFC 9728準拠のProtected Resource Metadata
 * 純粋関数による認証フローと状態管理
 */

import type { HatagoPlugin } from '@hatago/core'
import type { ExampleConfig, TestScenario } from '../_shared/types.js'

// ===== 型定義（不変データ構造） =====

/**
 * OAuth設定（RFC 9728準拠）
 */
interface OAuthConfig {
  readonly resourceIdentifier: string
  readonly authorizationServers: readonly AuthorizationServer[]
  readonly bearerMethods: readonly BearerMethod[]
  readonly enableIntrospection: boolean
  readonly enableJWTValidation: boolean
  readonly scopeValidation: ScopeValidationConfig
  readonly tokenCache: TokenCacheConfig
  readonly securityPolicy: SecurityPolicyConfig
}

/**
 * 認可サーバー情報
 */
interface AuthorizationServer {
  readonly issuer: string
  readonly authorizationEndpoint?: string
  readonly tokenEndpoint?: string
  readonly introspectionEndpoint?: string
  readonly jwksUri?: string
  readonly supportedScopes: readonly string[]
  readonly supportedGrantTypes: readonly string[]
  readonly supportedResponseTypes: readonly string[]
}

/**
 * Bearer認証方法
 */
type BearerMethod = 'header' | 'form' | 'uri'

/**
 * トークン情報（不変）
 */
interface TokenInfo {
  readonly tokenHash: string
  readonly isValid: boolean
  readonly expiresAt: number | null
  readonly issuedAt: number
  readonly scope: readonly string[]
  readonly audience: readonly string[]
  readonly clientId?: string
  readonly userId?: string
  readonly tokenType: TokenType
  readonly introspectionResult?: IntrospectionResult
}

/**
 * トークン種別
 */
type TokenType = 'access_token' | 'refresh_token' | 'id_token'

/**
 * イントロスペクション結果（RFC 7662）
 */
interface IntrospectionResult {
  readonly active: boolean
  readonly scope?: string
  readonly clientId?: string
  readonly username?: string
  readonly tokenType?: string
  readonly exp?: number
  readonly iat?: number
  readonly nbf?: number
  readonly sub?: string
  readonly aud?: string | readonly string[]
  readonly iss?: string
  readonly jti?: string
}

/**
 * スコープ検証設定
 */
interface ScopeValidationConfig {
  readonly required: readonly string[]
  readonly optional: readonly string[]
  readonly strictMode: boolean
  readonly allowUndeclaredScopes: boolean
}

/**
 * トークンキャッシュ設定
 */
interface TokenCacheConfig {
  readonly enabled: boolean
  readonly ttlSeconds: number
  readonly maxEntries: number
  readonly cleanupIntervalSeconds: number
}

/**
 * セキュリティポリシー設定
 */
interface SecurityPolicyConfig {
  readonly requireHttps: boolean
  readonly allowedOrigins: readonly string[]
  readonly maxTokenAge: number
  readonly enableRateLimiting: boolean
  readonly auditLogging: boolean
}

/**
 * 認証要求（不変）
 */
interface AuthenticationRequest {
  readonly token: string
  readonly method: BearerMethod
  readonly origin?: string
  readonly userAgent?: string
  readonly timestamp: number
  readonly requestId: string
}

/**
 * 認証結果
 */
interface AuthenticationResult {
  readonly success: boolean
  readonly tokenInfo?: TokenInfo
  readonly error?: AuthenticationError
  readonly wwwAuthenticate?: string
  readonly cacheHit: boolean
  readonly validationTimeMs: number
}

/**
 * 認証エラー
 */
interface AuthenticationError {
  readonly code: AuthErrorCode
  readonly description: string
  readonly hint?: string
  readonly statusCode: number
}

/**
 * 認証エラーコード（RFC 6750）
 */
type AuthErrorCode =
  | 'invalid_request'
  | 'invalid_token'
  | 'insufficient_scope'
  | 'expired_token'
  | 'revoked_token'
  | 'unsupported_token_type'

/**
 * 保護されたリソースメタデータ（RFC 9728）
 */
interface ProtectedResourceMetadata {
  readonly resource: string
  readonly authorization_servers: readonly string[]
  readonly bearer_methods_supported?: readonly BearerMethod[]
  readonly resource_documentation?: string
  readonly resource_policy_uri?: string
  readonly resource_tos_uri?: string
  readonly scopes_supported?: readonly string[]
  readonly introspection_endpoint?: string
  readonly revocation_endpoint?: string
  readonly response_types_supported?: readonly string[]
}

// ===== 純粋関数群 =====

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: OAuthConfig = {
  resourceIdentifier: 'https://api.example.com',
  authorizationServers: [],
  bearerMethods: ['header', 'form'],
  enableIntrospection: true,
  enableJWTValidation: false,
  scopeValidation: {
    required: [],
    optional: [],
    strictMode: false,
    allowUndeclaredScopes: true,
  },
  tokenCache: {
    enabled: true,
    ttlSeconds: 300,
    maxEntries: 1000,
    cleanupIntervalSeconds: 60,
  },
  securityPolicy: {
    requireHttps: true,
    allowedOrigins: [],
    maxTokenAge: 3600,
    enableRateLimiting: false,
    auditLogging: true,
  },
} as const

/**
 * 環境変数からの設定読み込み（純粋関数）
 */
const loadConfigFromEnv = (env: Record<string, string | undefined>): Partial<OAuthConfig> => {
  const authServers = env.AUTH_SERVERS
    ? env.AUTH_SERVERS.split(',').map(issuer => ({
        issuer: issuer.trim(),
        supportedScopes: [],
        supportedGrantTypes: ['authorization_code'],
        supportedResponseTypes: ['code'],
      }))
    : []

  return {
    resourceIdentifier: env.RESOURCE_IDENTIFIER,
    authorizationServers: authServers,
    enableIntrospection: env.ENABLE_INTROSPECTION === 'true',
    enableJWTValidation: env.ENABLE_JWT_VALIDATION === 'true',
    securityPolicy: {
      requireHttps: env.REQUIRE_HTTPS !== 'false',
      allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [],
      maxTokenAge: env.MAX_TOKEN_AGE ? Number.parseInt(env.MAX_TOKEN_AGE, 10) : undefined,
      enableRateLimiting: env.ENABLE_RATE_LIMITING === 'true',
      auditLogging: env.AUDIT_LOGGING !== 'false',
    },
  }
}

/**
 * トークンハッシュ生成（純粋関数）
 */
const createTokenHash = (token: string): string => {
  // 実際の実装ではcrypto.createHashを使用
  const hash = token.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  return Math.abs(hash).toString(16)
}

/**
 * Bearerトークンの抽出（純粋関数）
 */
const _extractBearerToken = (
  headers: Record<string, string>,
  formData?: Record<string, string>,
  queryParams?: Record<string, string>
): { token: string; method: BearerMethod } | null => {
  // Authorization Header（優先）
  const authHeader = headers.authorization || headers.Authorization
  if (authHeader?.startsWith('Bearer ')) {
    return {
      token: authHeader.substring(7),
      method: 'header',
    }
  }

  // Form Data
  if (formData?.access_token) {
    return {
      token: formData.access_token,
      method: 'form',
    }
  }

  // Query Parameter
  if (queryParams?.access_token) {
    return {
      token: queryParams.access_token,
      method: 'uri',
    }
  }

  return null
}

/**
 * スコープ検証（純粋関数）
 */
const validateScopes = (
  tokenScopes: readonly string[],
  config: ScopeValidationConfig
): { valid: boolean; missing: readonly string[] } => {
  const missing = config.required.filter(scope => !tokenScopes.includes(scope))

  if (missing.length > 0) {
    return { valid: false, missing }
  }

  // 厳密モードでは宣言されていないスコープを拒否
  if (config.strictMode && !config.allowUndeclaredScopes) {
    const allowedScopes = [...config.required, ...config.optional]
    const undeclared = tokenScopes.filter(scope => !allowedScopes.includes(scope))

    if (undeclared.length > 0) {
      return { valid: false, missing: undeclared }
    }
  }

  return { valid: true, missing: [] }
}

/**
 * トークン有効期限チェック（純粋関数）
 */
const isTokenExpired = (tokenInfo: TokenInfo, now: number): boolean => {
  if (!tokenInfo.expiresAt) return false
  return now > tokenInfo.expiresAt
}

/**
 * オーディエンス検証（純粋関数）
 */
const validateAudience = (
  tokenAudience: readonly string[],
  resourceIdentifier: string
): boolean => {
  if (tokenAudience.length === 0) return true // オーディエンス指定なしは許可
  return tokenAudience.includes(resourceIdentifier)
}

/**
 * WWW-Authenticate ヘッダー生成（純粋関数）
 */
const createWWWAuthenticateHeader = (
  error: AuthenticationError,
  authServers: readonly AuthorizationServer[]
): string => {
  const realm = authServers[0]?.issuer || 'OAuth'
  const params = [
    `realm="${realm}"`,
    `error="${error.code}"`,
    `error_description="${error.description}"`,
  ]

  if (error.hint) {
    params.push(`error_hint="${error.hint}"`)
  }

  return `Bearer ${params.join(', ')}`
}

/**
 * Protected Resource Metadata生成（純粋関数）
 */
const createProtectedResourceMetadata = (config: OAuthConfig): ProtectedResourceMetadata => ({
  resource: config.resourceIdentifier,
  authorization_servers: config.authorizationServers.map(server => server.issuer),
  bearer_methods_supported: config.bearerMethods,
  scopes_supported: config.authorizationServers.flatMap(server => server.supportedScopes),
  introspection_endpoint: config.enableIntrospection
    ? config.authorizationServers[0]?.introspectionEndpoint
    : undefined,
  response_types_supported: config.authorizationServers.flatMap(
    server => server.supportedResponseTypes
  ),
})

/**
 * 認証エラー作成（純粋関数）
 */
const createAuthError = (
  code: AuthErrorCode,
  description: string,
  hint?: string
): AuthenticationError => {
  const statusCodes: Record<AuthErrorCode, number> = {
    invalid_request: 400,
    invalid_token: 401,
    insufficient_scope: 403,
    expired_token: 401,
    revoked_token: 401,
    unsupported_token_type: 401,
  }

  return {
    code,
    description,
    hint,
    statusCode: statusCodes[code],
  }
}

/**
 * トークン妥当性検証（純粋関数）
 */
const validateToken = (
  tokenInfo: TokenInfo,
  config: OAuthConfig,
  now: number
): AuthenticationResult => {
  const startTime = Date.now()

  // 期限切れチェック
  if (isTokenExpired(tokenInfo, now)) {
    return {
      success: false,
      error: createAuthError('expired_token', 'Token has expired'),
      cacheHit: false,
      validationTimeMs: Date.now() - startTime,
    }
  }

  // オーディエンス検証
  if (!validateAudience(tokenInfo.audience, config.resourceIdentifier)) {
    return {
      success: false,
      error: createAuthError('invalid_token', 'Invalid token audience'),
      cacheHit: false,
      validationTimeMs: Date.now() - startTime,
    }
  }

  // スコープ検証
  const scopeValidation = validateScopes(tokenInfo.scope, config.scopeValidation)
  if (!scopeValidation.valid) {
    return {
      success: false,
      error: createAuthError(
        'insufficient_scope',
        'Insufficient scope',
        `Required scopes: ${scopeValidation.missing.join(', ')}`
      ),
      cacheHit: false,
      validationTimeMs: Date.now() - startTime,
    }
  }

  return {
    success: true,
    tokenInfo,
    cacheHit: false,
    validationTimeMs: Date.now() - startTime,
  }
}

// ===== トークンキャッシュ実装 =====

/**
 * インメモリトークンキャッシュ
 */
class TokenCache {
  private cache = new Map<string, TokenInfo>()
  private readonly config: TokenCacheConfig

  constructor(config: TokenCacheConfig) {
    this.config = config

    // 定期的なクリーンアップ
    if (config.enabled && config.cleanupIntervalSeconds > 0) {
      setInterval(() => this.cleanup(), config.cleanupIntervalSeconds * 1000)
    }
  }

  /**
   * トークン情報の取得
   */
  get(tokenHash: string): TokenInfo | null {
    if (!this.config.enabled) return null

    const tokenInfo = this.cache.get(tokenHash)
    if (!tokenInfo) return null

    // 期限切れチェック
    if (isTokenExpired(tokenInfo, Date.now())) {
      this.cache.delete(tokenHash)
      return null
    }

    return tokenInfo
  }

  /**
   * トークン情報の設定
   */
  set(tokenHash: string, tokenInfo: TokenInfo): void {
    if (!this.config.enabled) return

    // キャッシュサイズ制限
    if (this.cache.size >= this.config.maxEntries) {
      this.cleanup()
    }

    this.cache.set(tokenHash, tokenInfo)
  }

  /**
   * 期限切れエントリのクリーンアップ
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [hash, tokenInfo] of this.cache) {
      if (isTokenExpired(tokenInfo, now)) {
        this.cache.delete(hash)
      }
    }
  }

  /**
   * キャッシュ統計
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // 実装では実際のヒット率を計算
    }
  }

  /**
   * キャッシュクリア
   */
  clear(): void {
    this.cache.clear()
  }
}

// ===== OAuth認証ハンドラー =====

/**
 * OAuth認証ハンドラークラス
 */
class OAuthHandler {
  private readonly config: OAuthConfig
  private readonly tokenCache: TokenCache

  constructor(config: OAuthConfig) {
    this.config = config
    this.tokenCache = new TokenCache(config.tokenCache)
  }

  /**
   * 認証要求の処理
   */
  async authenticate(request: AuthenticationRequest): Promise<AuthenticationResult> {
    const startTime = Date.now()

    try {
      // トークンハッシュ生成
      const tokenHash = createTokenHash(request.token)

      // キャッシュチェック
      const cachedToken = this.tokenCache.get(tokenHash)
      if (cachedToken) {
        const result = validateToken(cachedToken, this.config, Date.now())
        return { ...result, cacheHit: true }
      }

      // トークン検証
      const tokenInfo = await this.validateTokenWithServer(request.token)
      if (!tokenInfo) {
        return {
          success: false,
          error: createAuthError('invalid_token', 'Token validation failed'),
          cacheHit: false,
          validationTimeMs: Date.now() - startTime,
        }
      }

      // キャッシュに保存
      this.tokenCache.set(tokenHash, tokenInfo)

      // 最終検証
      return validateToken(tokenInfo, this.config, Date.now())
    } catch (error) {
      return {
        success: false,
        error: createAuthError(
          'invalid_request',
          'Authentication failed',
          error instanceof Error ? error.message : String(error)
        ),
        cacheHit: false,
        validationTimeMs: Date.now() - startTime,
      }
    }
  }

  /**
   * サーバーでのトークン検証（実際の実装では外部API呼び出し）
   */
  private async validateTokenWithServer(token: string): Promise<TokenInfo | null> {
    // モック実装：実際はイントロスペクションエンドポイントを呼び出し
    if (token === 'invalid') {
      return null
    }

    // 模擬的なトークン情報
    return {
      tokenHash: createTokenHash(token),
      isValid: true,
      expiresAt: Date.now() + 3600 * 1000, // 1時間後
      issuedAt: Date.now(),
      scope: ['read', 'write'],
      audience: [this.config.resourceIdentifier],
      clientId: 'test-client',
      userId: 'user123',
      tokenType: 'access_token',
    }
  }

  /**
   * Protected Resource Metadata取得
   */
  getMetadata(): ProtectedResourceMetadata {
    return createProtectedResourceMetadata(this.config)
  }

  /**
   * キャッシュ統計取得
   */
  getCacheStats(): { size: number; hitRate: number } {
    return this.tokenCache.getStats()
  }

  /**
   * キャッシュクリア
   */
  clearCache(): void {
    this.tokenCache.clear()
  }
}

// ===== MCPツール実装 =====

/**
 * OAuth認証ツール
 */
const createOAuthAuthenticateTool = (handler: OAuthHandler) => async (request: any) => {
  const {
    token,
    method = 'header',
    origin,
    userAgent,
  } = request.params.arguments as {
    token: string
    method?: BearerMethod
    origin?: string
    userAgent?: string
  }

  const authRequest: AuthenticationRequest = {
    token,
    method,
    origin,
    userAgent,
    timestamp: Date.now(),
    requestId: `auth-${Date.now()}`,
  }

  const result = await handler.authenticate(authRequest)

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: result.success,
            tokenInfo: result.tokenInfo
              ? {
                  isValid: result.tokenInfo.isValid,
                  scope: result.tokenInfo.scope,
                  audience: result.tokenInfo.audience,
                  clientId: result.tokenInfo.clientId,
                  userId: result.tokenInfo.userId,
                  expiresAt: result.tokenInfo.expiresAt,
                }
              : undefined,
            error: result.error,
            cacheHit: result.cacheHit,
            validationTimeMs: result.validationTimeMs,
            wwwAuthenticate: result.error
              ? createWWWAuthenticateHeader(result.error, handler.config.authorizationServers)
              : undefined,
          },
          null,
          2
        ),
      },
    ],
  }
}

/**
 * OAuth メタデータツール
 */
const createOAuthMetadataTool = (handler: OAuthHandler) => async (_request: any) => {
  const metadata = handler.getMetadata()

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(metadata, null, 2),
      },
    ],
  }
}

/**
 * OAuth ステータスツール
 */
const createOAuthStatusTool = (handler: OAuthHandler) => async (request: any) => {
  const { includeCache = true } = request.params.arguments as {
    includeCache?: boolean
  }

  const cacheStats = includeCache ? handler.getCacheStats() : undefined

  const status = {
    resourceIdentifier: handler.config.resourceIdentifier,
    authorizationServers: handler.config.authorizationServers.length,
    enabledFeatures: {
      introspection: handler.config.enableIntrospection,
      jwtValidation: handler.config.enableJWTValidation,
      tokenCache: handler.config.tokenCache.enabled,
      rateLimiting: handler.config.securityPolicy.enableRateLimiting,
      auditLogging: handler.config.securityPolicy.auditLogging,
    },
    ...(includeCache && { cache: cacheStats }),
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(status, null, 2),
      },
    ],
  }
}

/**
 * OAuth キャッシュ管理ツール
 */
const createOAuthCacheTool = (handler: OAuthHandler) => async (request: any) => {
  const { action } = request.params.arguments as {
    action: 'stats' | 'clear'
  }

  if (action === 'stats') {
    const stats = handler.getCacheStats()
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2),
        },
      ],
    }
  }

  if (action === 'clear') {
    handler.clearCache()
    return {
      content: [
        {
          type: 'text',
          text: 'Cache cleared successfully',
        },
      ],
    }
  }

  throw new Error('Invalid action. Use "stats" or "clear"')
}

// ===== プラグイン実装 =====

/**
 * OAuth メタデータプラグインの作成
 */
export const createOAuthMetadataPlugin = (userConfig: Partial<OAuthConfig> = {}): HatagoPlugin => {
  return async ctx => {
    // 設定の合成
    const envConfig = loadConfigFromEnv(ctx.env || {})
    const config: OAuthConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      ...envConfig,
      authorizationServers: [
        ...DEFAULT_CONFIG.authorizationServers,
        ...(userConfig.authorizationServers || []),
        ...(envConfig.authorizationServers || []),
      ],
      scopeValidation: {
        ...DEFAULT_CONFIG.scopeValidation,
        ...userConfig.scopeValidation,
        ...envConfig.scopeValidation,
      },
      tokenCache: {
        ...DEFAULT_CONFIG.tokenCache,
        ...userConfig.tokenCache,
        ...envConfig.tokenCache,
      },
      securityPolicy: {
        ...DEFAULT_CONFIG.securityPolicy,
        ...userConfig.securityPolicy,
        ...envConfig.securityPolicy,
      },
    }

    // OAuth ハンドラー初期化
    const oauthHandler = new OAuthHandler(config)

    // Protected Resource Metadata エンドポイント
    ctx.app.get('/.well-known/oauth-protected-resource', c => {
      const metadata = oauthHandler.getMetadata()
      return c.json(metadata)
    })

    // 認証ミドルウェア
    if (config.securityPolicy.enableRateLimiting) {
      ctx.app.use(async (c, next) => {
        // 認証ヘッダーのチェック
        const authHeader = c.req.header('authorization')
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.substring(7)
          const authRequest: AuthenticationRequest = {
            token,
            method: 'header',
            origin: c.req.header('origin'),
            userAgent: c.req.header('user-agent'),
            timestamp: Date.now(),
            requestId: `req-${Date.now()}`,
          }

          const result = await oauthHandler.authenticate(authRequest)

          if (!result.success && result.error) {
            const wwwAuth = createWWWAuthenticateHeader(result.error, config.authorizationServers)
            return c.json(
              {
                error: result.error.code,
                error_description: result.error.description,
                error_hint: result.error.hint,
              },
              result.error.statusCode,
              {
                'WWW-Authenticate': wwwAuth,
              }
            )
          }
        }

        await next()
      })
    }

    // MCPツール登録
    ctx.server.registerTool(
      'oauth_authenticate',
      {
        description: 'Authenticate OAuth token',
        inputSchema: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'OAuth access token',
            },
            method: {
              type: 'string',
              enum: ['header', 'form', 'uri'],
              description: 'Bearer token method',
              default: 'header',
            },
            origin: {
              type: 'string',
              description: 'Request origin',
            },
            userAgent: {
              type: 'string',
              description: 'User agent',
            },
          },
          required: ['token'],
        },
      },
      createOAuthAuthenticateTool(oauthHandler)
    )

    ctx.server.registerTool(
      'oauth_metadata',
      {
        description: 'Get OAuth Protected Resource Metadata',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      createOAuthMetadataTool(oauthHandler)
    )

    ctx.server.registerTool(
      'oauth_status',
      {
        description: 'Get OAuth authentication status and configuration',
        inputSchema: {
          type: 'object',
          properties: {
            includeCache: {
              type: 'boolean',
              description: 'Include cache statistics',
              default: true,
            },
          },
        },
      },
      createOAuthStatusTool(oauthHandler)
    )

    ctx.server.registerTool(
      'oauth_cache',
      {
        description: 'Manage OAuth token cache',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['stats', 'clear'],
              description: 'Cache action to perform',
            },
          },
          required: ['action'],
        },
      },
      createOAuthCacheTool(oauthHandler)
    )
  }
}

// ===== テストシナリオ =====

const testScenarios: readonly TestScenario[] = [
  {
    name: 'Authenticate valid token',
    input: { token: 'valid_token_123' },
    expectedOutput: 'success',
  },
  {
    name: 'Authenticate invalid token',
    input: { token: 'invalid' },
    expectedOutput: 'invalid_token',
  },
  {
    name: 'Get OAuth metadata',
    input: {},
    expectedOutput: 'authorization_servers',
  },
  {
    name: 'Get OAuth status',
    input: { includeCache: true },
    expectedOutput: 'resourceIdentifier',
  },
  {
    name: 'Get cache statistics',
    input: { action: 'stats' },
    expectedOutput: 'size',
  },
  {
    name: 'Clear token cache',
    input: { action: 'clear' },
    expectedOutput: 'cleared successfully',
  },
] as const

// ===== 実行設定 =====

const config: ExampleConfig = {
  name: 'oauth-metadata',
  description:
    'OAuth 2.1 Protected Resource Metadata (RFC 9728) with functional authentication flows',
  plugin: createOAuthMetadataPlugin({
    resourceIdentifier: 'https://api.example.com',
    authorizationServers: [
      {
        issuer: 'https://auth.example.com',
        authorizationEndpoint: 'https://auth.example.com/oauth/authorize',
        tokenEndpoint: 'https://auth.example.com/oauth/token',
        introspectionEndpoint: 'https://auth.example.com/oauth/introspect',
        jwksUri: 'https://auth.example.com/.well-known/jwks.json',
        supportedScopes: ['read', 'write', 'admin'],
        supportedGrantTypes: ['authorization_code', 'client_credentials'],
        supportedResponseTypes: ['code'],
      },
    ],
    bearerMethods: ['header', 'form'],
    enableIntrospection: true,
    enableJWTValidation: false,
    scopeValidation: {
      required: ['read'],
      optional: ['write', 'admin'],
      strictMode: false,
      allowUndeclaredScopes: true,
    },
    tokenCache: {
      enabled: true,
      ttlSeconds: 300,
      maxEntries: 100,
      cleanupIntervalSeconds: 60,
    },
    securityPolicy: {
      requireHttps: true,
      allowedOrigins: ['https://app.example.com'],
      maxTokenAge: 3600,
      enableRateLimiting: false,
      auditLogging: true,
    },
  }),
  testScenarios,
  env: {
    RESOURCE_IDENTIFIER: 'https://api.example.com',
    AUTH_SERVERS: 'https://auth.example.com',
    ENABLE_INTROSPECTION: 'true',
    REQUIRE_HTTPS: 'true',
    AUDIT_LOGGING: 'true',
  },
} as const

export default config
