# OAuth Metadata Plugin Example

RFC 9728準拠のOAuth 2.1 Protected Resource Metadataプラグインの関数型実装例。認証・認可フローを純粋関数で構築。

## 概要

このプラグインは：

- OAuth 2.1 / RFC 9728 Protected Resource Metadata準拠
- Bearer認証トークンの検証とキャッシュ
- スコープベースの認可制御
- イントロスペクションエンドポイント対応
- 関数型パターンによる状態管理

## 実行方法

```bash
# 基本的なOAuth認証機能（デフォルト）
pnpm ex --plugin oauth-metadata --mode smoke

# カスタム認証サーバー設定
AUTH_SERVERS=https://auth.example.com pnpm ex --plugin oauth-metadata --mode full

# イントロスペクション有効化
ENABLE_INTROSPECTION=true pnpm ex --plugin oauth-metadata --mode smoke

# HTTPS必須の本番環境設定
REQUIRE_HTTPS=true AUDIT_LOGGING=true pnpm ex --plugin oauth-metadata --mode full
```

## 期待される動作

### Bearer認証フロー

```
✅ SUCCESS (120ms)
OAuth Authentication Flow initialized

AUTHENTICATE: Bearer valid_token_123
✓ Token validation: success
✓ Scope validation: [read, write] ✓
✓ Audience validation: https://api.example.com ✓
✓ Cache stored: hash_abc123 (TTL: 300s)

AUTHENTICATE: Bearer invalid_token
✗ Token validation: failed
✗ Error: invalid_token
✗ WWW-Authenticate: Bearer realm="OAuth", error="invalid_token"
```

### Protected Resource Metadata

```
GET /.well-known/oauth-protected-resource
{
  "resource": "https://api.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "bearer_methods_supported": ["header", "form"],
  "scopes_supported": ["read", "write", "admin"]
}
```

### トークンキャッシュ効果

```
1st request: validation_time=85ms, cache_hit=false
2nd request: validation_time=2ms,  cache_hit=true
3rd request: validation_time=1ms,  cache_hit=true

Cache efficiency: 97% faster for subsequent requests
```

## アーキテクチャ説明

### 関数型認証フロー

```typescript
// トークン検証パイプライン（純粋関数の合成）
const authenticateToken = async (request: AuthenticationRequest): Promise<AuthenticationResult> => {
  const tokenHash = createTokenHash(request.token)
  const cached = tokenCache.get(tokenHash)

  if (cached) {
    return validateToken(cached, config, Date.now())
  }

  const tokenInfo = await validateTokenWithServer(request.token)
  if (tokenInfo) {
    tokenCache.set(tokenHash, tokenInfo)
    return validateToken(tokenInfo, config, Date.now())
  }

  return createAuthError('invalid_token', 'Token validation failed')
}
```

### 不変データ構造

```typescript
// トークン情報（完全に不変）
interface TokenInfo {
  readonly tokenHash: string
  readonly isValid: boolean
  readonly expiresAt: number | null
  readonly scope: ReadonlyArray<string>
  readonly audience: ReadonlyArray<string>
  readonly clientId?: string
  readonly tokenType: TokenType
}

// 認証結果（不変）
interface AuthenticationResult {
  readonly success: boolean
  readonly tokenInfo?: TokenInfo
  readonly error?: AuthenticationError
  readonly cacheHit: boolean
  readonly validationTimeMs: number
}
```

### スコープ検証システム

```typescript
// スコープ検証（純粋関数）
const validateScopes = (
  tokenScopes: ReadonlyArray<string>,
  config: ScopeValidationConfig
): { valid: boolean; missing: ReadonlyArray<string> } => {
  const missing = config.required.filter(scope => !tokenScopes.includes(scope))

  if (missing.length > 0) {
    return { valid: false, missing }
  }

  // 厳密モードでの未宣言スコープチェック
  if (config.strictMode && !config.allowUndeclaredScopes) {
    const allowed = [...config.required, ...config.optional]
    const undeclared = tokenScopes.filter(scope => !allowed.includes(scope))

    if (undeclared.length > 0) {
      return { valid: false, missing: undeclared }
    }
  }

  return { valid: true, missing: [] }
}
```

### Bearer認証方法の抽象化

```typescript
// Bearer認証抽出（純粋関数）
const extractBearerToken = (
  headers: Record<string, string>,
  formData?: Record<string, string>,
  queryParams?: Record<string, string>
): { token: string; method: BearerMethod } | null => {
  // Authorization Header（推奨）
  const authHeader = headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return { token: authHeader.substring(7), method: 'header' }
  }

  // Form Data
  if (formData?.access_token) {
    return { token: formData.access_token, method: 'form' }
  }

  // Query Parameter（非推奨）
  if (queryParams?.access_token) {
    return { token: queryParams.access_token, method: 'uri' }
  }

  return null
}
```

## MCPツール

### `oauth_authenticate`

Bearer認証トークンの検証

```typescript
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "method": "header",              // header | form | uri
  "origin": "https://app.example.com",
  "userAgent": "Mozilla/5.0..."
}
```

**レスポンス例：**

```json
{
  "success": true,
  "tokenInfo": {
    "isValid": true,
    "scope": ["read", "write"],
    "audience": ["https://api.example.com"],
    "clientId": "client_12345",
    "userId": "user_67890",
    "expiresAt": 1704067200000
  },
  "cacheHit": false,
  "validationTimeMs": 85
}
```

### `oauth_metadata`

Protected Resource Metadata（RFC 9728）の取得

```typescript
{
  // パラメータなし
}
```

**レスポンス例：**

```json
{
  "resource": "https://api.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "bearer_methods_supported": ["header", "form"],
  "scopes_supported": ["read", "write", "admin"],
  "introspection_endpoint": "https://auth.example.com/oauth/introspect",
  "response_types_supported": ["code"]
}
```

### `oauth_status`

OAuth認証システムの状態確認

```typescript
{
  "includeCache": true            // キャッシュ統計を含む
}
```

**レスポンス例：**

```json
{
  "resourceIdentifier": "https://api.example.com",
  "authorizationServers": 1,
  "enabledFeatures": {
    "introspection": true,
    "jwtValidation": false,
    "tokenCache": true,
    "rateLimiting": false,
    "auditLogging": true
  },
  "cache": {
    "size": 42,
    "hitRate": 0.87
  }
}
```

### `oauth_cache`

トークンキャッシュの管理

```typescript
{
  "action": "stats"              // stats | clear
}
```

**統計レスポンス：**

```json
{
  "size": 42,
  "hitRate": 0.87,
  "totalRequests": 156,
  "cacheHits": 136,
  "cacheMisses": 20
}
```

## 実装パターン

### トークンキャッシュ実装

```typescript
// インメモリトークンキャッシュ（関数型設計）
class TokenCache {
  private cache = new Map<string, TokenInfo>()

  get(tokenHash: string): TokenInfo | null {
    const tokenInfo = this.cache.get(tokenHash)
    if (!tokenInfo) return null

    // 期限切れチェック（純粋関数）
    if (isTokenExpired(tokenInfo, Date.now())) {
      this.cache.delete(tokenHash)
      return null
    }

    return tokenInfo
  }

  set(tokenHash: string, tokenInfo: TokenInfo): void {
    // キャッシュサイズ制限
    if (this.cache.size >= this.config.maxEntries) {
      this.cleanup()
    }

    this.cache.set(tokenHash, tokenInfo)
  }
}
```

### イントロスペクション実装

```typescript
// RFC 7662準拠のトークンイントロスペクション
const introspectToken = async (
  token: string,
  introspectionEndpoint: string,
  clientCredentials: ClientCredentials
): Promise<IntrospectionResult> => {
  const response = await fetch(introspectionEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientCredentials.id}:${clientCredentials.secret}`)}`,
    },
    body: new URLSearchParams({
      token,
      token_type_hint: 'access_token',
    }),
  })

  return await response.json()
}
```

### WWW-Authenticateヘッダー生成

```typescript
// RFC 6750準拠のエラーレスポンス
const createWWWAuthenticateHeader = (
  error: AuthenticationError,
  authServers: ReadonlyArray<AuthorizationServer>
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
```

### セキュリティポリシー実装

```typescript
// セキュリティポリシーの適用
const validateSecurityPolicy = (
  request: AuthenticationRequest,
  policy: SecurityPolicyConfig
): ValidationResult => {
  // HTTPS必須チェック
  if (policy.requireHttps && request.origin && !request.origin.startsWith('https://')) {
    return { valid: false, reason: 'HTTPS required' }
  }

  // オリジン制限チェック
  if (policy.allowedOrigins.length > 0 && request.origin) {
    if (!policy.allowedOrigins.includes(request.origin)) {
      return { valid: false, reason: 'Origin not allowed' }
    }
  }

  // トークン年齢チェック
  const tokenAge = Date.now() - request.timestamp
  if (tokenAge > policy.maxTokenAge * 1000) {
    return { valid: false, reason: 'Token too old' }
  }

  return { valid: true }
}
```

## HTTP統合

### Protected Resource Metadataエンドポイント

```typescript
// RFC 9728準拠のエンドポイント
app.get('/.well-known/oauth-protected-resource', c => {
  const metadata = createProtectedResourceMetadata(config)
  return c.json(metadata)
})
```

### 認証ミドルウェア

```typescript
// Bearer認証ミドルウェア
app.use(async (c, next) => {
  const authHeader = c.req.header('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const authRequest: AuthenticationRequest = {
      token,
      method: 'header',
      origin: c.req.header('origin'),
      userAgent: c.req.header('user-agent'),
      timestamp: Date.now(),
      requestId: generateRequestId(),
    }

    const result = await oauthHandler.authenticate(authRequest)

    if (!result.success && result.error) {
      const wwwAuth = createWWWAuthenticateHeader(result.error, config.authorizationServers)
      return c.json(
        {
          error: result.error.code,
          error_description: result.error.description,
        },
        result.error.statusCode,
        {
          'WWW-Authenticate': wwwAuth,
        }
      )
    }

    // 認証成功時はリクエストコンテキストにトークン情報を追加
    c.set('tokenInfo', result.tokenInfo)
  }

  await next()
})
```

## テスト戦略

### 認証フローテスト

```typescript
describe('OAuth Authentication Flow', () => {
  it('should authenticate valid bearer token', async () => {
    // Given: 有効なBearerトークン
    const token = 'valid_access_token'

    // When: 認証を実行
    const result = await oauthHandler.authenticate({
      token,
      method: 'header',
      timestamp: Date.now(),
      requestId: 'test-1',
    })

    // Then: 認証が成功
    expect(result.success).toBe(true)
    expect(result.tokenInfo?.scope).toContain('read')
  })
})
```

### キャッシュ効果テスト

```typescript
describe('Token Cache Behavior', () => {
  it('should improve performance with caching', async () => {
    const token = 'cached_token'

    // 1回目: サーバー検証
    const start1 = Date.now()
    const result1 = await oauthHandler.authenticate({
      token,
      method: 'header',
      timestamp: Date.now(),
      requestId: 'test-1',
    })
    const duration1 = Date.now() - start1

    // 2回目: キャッシュヒット
    const start2 = Date.now()
    const result2 = await oauthHandler.authenticate({
      token,
      method: 'header',
      timestamp: Date.now(),
      requestId: 'test-2',
    })
    const duration2 = Date.now() - start2

    expect(result1.cacheHit).toBe(false)
    expect(result2.cacheHit).toBe(true)
    expect(duration2).toBeLessThan(duration1)
  })
})
```

### スコープ検証テスト

```typescript
describe('Scope Validation', () => {
  it('should validate required scopes', () => {
    const tokenScopes = ['read', 'profile']
    const config = {
      required: ['read', 'profile'],
      optional: ['write'],
      strictMode: true,
      allowUndeclaredScopes: false,
    }

    const result = validateScopes(tokenScopes, config)

    expect(result.valid).toBe(true)
    expect(result.missing).toHaveLength(0)
  })
})
```

## 設定オプション

### 環境変数

- `RESOURCE_IDENTIFIER`: リソース識別子URL
- `AUTH_SERVERS`: 認証サーバーのカンマ区切りリスト
- `ENABLE_INTROSPECTION`: イントロスペクション有効化
- `ENABLE_JWT_VALIDATION`: JWT検証有効化
- `REQUIRE_HTTPS`: HTTPS必須（本番環境推奨）
- `ALLOWED_ORIGINS`: 許可オリジンのカンマ区切りリスト
- `AUDIT_LOGGING`: 監査ログ有効化

### プラグイン設定

```typescript
const oauthPlugin = createOAuthMetadataPlugin({
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
  scopeValidation: {
    required: ['read'],
    optional: ['write', 'admin'],
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
    allowedOrigins: ['https://app.example.com'],
    maxTokenAge: 3600,
    enableRateLimiting: true,
    auditLogging: true,
  },
})
```

## 学習ポイント

1. **RFC準拠**: OAuth 2.1とRFC 9728の正確な実装
2. **関数型認証**: 純粋関数による認証フローの構築
3. **キャッシュ戦略**: トークン検証の効率化
4. **セキュリティ**: 多層防御とベストプラクティス
5. **エラーハンドリング**: 標準準拠のエラーレスポンス
