# GitHub OAuth Plugin Example

GitHub OAuth 2.1統合プラグインの関数型実装例。PKCE対応の完全なOAuthフローを純粋関数で構築。

## 概要

このプラグインは：

- GitHub OAuth 2.1 完全対応（Authorization Code Flow + PKCE）
- デバイスフロー対応（CLI/IoTアプリケーション向け）
- 状態管理とセキュリティ機能
- リフレッシュトークン対応
- 関数型パターンによるOAuthフロー管理

## 実行方法

```bash
# GitHub OAuth アプリケーション登録後
GITHUB_CLIENT_ID=your_client_id GITHUB_CLIENT_SECRET=your_secret \
pnpm ex --plugin github-oauth --mode smoke

# カスタムスコープ設定
GITHUB_SCOPES=repo,admin:org,user:email \
pnpm ex --plugin github-oauth --mode full

# デバイスフロー有効化（GitHub App必要）
GITHUB_ENABLE_DEVICE_FLOW=true \
pnpm ex --plugin github-oauth --mode smoke

# 本番環境設定
GITHUB_ENABLE_PKCE=true GITHUB_SESSION_TIMEOUT=3600 \
pnpm ex --plugin github-oauth --mode full
```

## 期待される動作

### Authorization Code Flow

```
✅ SUCCESS (200ms)
GitHub OAuth 2.1 Flow initialized

START: OAuth authorization flow
✓ State generated: abc123def456 (expires: 3600s)
✓ PKCE enabled: code_challenge=xyz789...
✓ Authorization URL: https://github.com/login/oauth/authorize?...

CALLBACK: Authorization code received
✓ State validation: success
✓ Token exchange: gho_xxxxxxxxxxxx (scope: read:user,user:email)
✓ User info: testuser (ID: 12345)
✓ Authentication: COMPLETE
```

### Device Flow（CLI/IoTアプリ向け）

```
DEVICE FLOW: Initiated
User Code: WDJB-MJHT
Verification URI: https://github.com/login/device

👤 Please visit: https://github.com/login/device
📱 Enter code: WDJB-MJHT
⏱ Polling every 5 seconds...

✅ Device authorized successfully
✓ Access token: gho_xxxxxxxxxxxx
✓ User: testuser
```

### セキュリティ機能

```
🔐 Security Features Active:
✓ PKCE (Proof Key for Code Exchange)
✓ State parameter validation
✓ CSRF protection
✓ Secure session management
✓ Token expiration handling
```

## アーキテクチャ説明

### 関数型OAuthフロー設計

```typescript
// OAuth状態の完全な不変管理
interface OAuthState {
  readonly state: string
  readonly codeVerifier?: string
  readonly codeChallenge?: string
  readonly redirectUri: string
  readonly scopes: ReadonlyArray<GitHubScope>
  readonly createdAt: number
  readonly expiresAt: number
  readonly sessionId: string
}

// 純粋関数によるOAuthフロー
const authenticateUser = async (code: string, state: string): Promise<OAuthFlowResult> => {
  const oauthState = validateAndConsumeState(state)
  const accessToken = await exchangeCodeForToken(code, oauthState)
  const user = await fetchUserInfo(accessToken)

  return createSuccessResult(accessToken, user)
}
```

### PKCE実装

```typescript
// PKCE パラメータ生成（純粋関数）
const generatePKCEParams = async (length: number): Promise<PKCEParams> => {
  const codeVerifier = generateRandomString(length)
  const challengeHash = await sha256Hash(codeVerifier)
  const codeChallenge = base64URLEncode(challengeHash)

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  }
}

// 認可URL生成（PKCE対応）
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
    ...(pkceParams && {
      code_challenge: pkceParams.codeChallenge,
      code_challenge_method: pkceParams.codeChallengeMethod,
    }),
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}
```

### 状態管理クラス

```typescript
// OAuth状態の安全な管理
class OAuthStateManager {
  private states = new Map<string, OAuthState>()

  async createState(userId?: string): Promise<{ state: OAuthState; authUrl: string }> {
    const state = generateRandomString(32)
    const pkceParams = await generatePKCEParams(128)

    const oauthState: OAuthState = {
      state,
      codeVerifier: pkceParams.codeVerifier,
      codeChallenge: pkceParams.codeChallenge,
      redirectUri: this.config.redirectUri,
      scopes: this.config.scopes,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.sessionTimeout * 1000,
      sessionId: generateRandomString(16),
    }

    this.states.set(state, oauthState)
    return { state: oauthState, authUrl: createAuthorizationUrl(config, state, pkceParams) }
  }

  consumeState(state: string): OAuthState | null {
    const oauthState = this.states.get(state)
    if (oauthState) {
      this.states.delete(state) // 一回限りの使用
    }
    return oauthState
  }
}
```

### セキュリティ検証

```typescript
// 状態検証（純粋関数）
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

// CSRF攻撃防止
const preventCSRF = (request: AuthRequest): boolean => {
  return request.origin && request.state && request.timestamp > Date.now() - 300000 // 5分以内
}
```

## MCPツール

### `github_auth_start`

GitHub OAuth認可フローの開始

```typescript
{
  "userId": "user_12345",           // オプション：ユーザーID関連付け
  "scopes": ["repo", "user:email"]  // オプション：カスタムスコープ
}
```

**レスポンス例：**

```json
{
  "authUrl": "https://github.com/login/oauth/authorize?client_id=...",
  "state": "abc123def456",
  "sessionId": "session_789",
  "instructions": "Redirect user to authUrl and handle callback with the authorization code"
}
```

### `github_auth_callback`

GitHub OAuth認可コールバックの処理

```typescript
{
  "code": "authorization_code_123",      // GitHubからの認可コード
  "state": "abc123def456",               // 状態パラメータ
  "error": "access_denied",              // オプション：エラーコード
  "error_description": "User denied"    // オプション：エラー説明
}
```

**成功レスポンス例：**

```json
{
  "success": true,
  "accessToken": {
    "tokenType": "bearer",
    "scope": ["read:user", "user:email", "public_repo"],
    "expiresIn": 28800,
    "tokenLength": 40
  },
  "user": {
    "id": 12345,
    "login": "testuser",
    "name": "Test User",
    "email": "test@example.com",
    "avatarUrl": "https://avatars.githubusercontent.com/u/12345",
    "htmlUrl": "https://github.com/testuser",
    "type": "User",
    "publicRepos": 42,
    "followers": 123,
    "following": 56,
    "createdAt": "2020-01-01T00:00:00Z"
  },
  "flowType": "authorization_code"
}
```

**エラーレスポンス例：**

```json
{
  "success": false,
  "error": {
    "error": "access_denied",
    "errorDescription": "The user denied the authorization request"
  },
  "flowType": "authorization_code"
}
```

### `github_device_flow`

デバイスフローの開始（CLI/IoTアプリ向け）

```typescript
{
  // パラメータなし
}
```

**レスポンス例：**

```json
{
  "userCode": "WDJB-MJHT",
  "verificationUri": "https://github.com/login/device",
  "verificationUriComplete": "https://github.com/login/device?user_code=WDJB-MJHT",
  "expiresIn": 900,
  "interval": 5,
  "instructions": "User should visit verificationUri and enter userCode"
}
```

### `github_oauth_status`

OAuth設定と状態の確認

```typescript
{
  "includeConfig": true           // 設定情報を含む
}
```

**レスポンス例：**

```json
{
  "stats": {
    "totalStates": 5,
    "activeStates": 3
  },
  "config": {
    "scopes": ["read:user", "user:email"],
    "enablePKCE": true,
    "allowSignup": true,
    "sessionTimeout": 3600,
    "enableDeviceFlow": false
  },
  "endpoints": {
    "authorize": "https://github.com/login/oauth/authorize",
    "token": "https://github.com/login/oauth/access_token",
    "device": "https://github.com/login/device/code",
    "revoke": "https://github.com/settings/connections/applications"
  }
}
```

### `github_oauth_clear`

OAuth状態のクリア（メンテナンス用）

```typescript
{
  "confirm": true                 // 安全確認必須
}
```

## HTTP統合

### OAuth認可エンドポイント

```typescript
// GET /oauth/github/authorize
// ユーザーをGitHub認可ページにリダイレクト
app.get('/oauth/github/authorize', async c => {
  const { authUrl } = await oauthHandler.startAuthFlow()
  return c.redirect(authUrl)
})
```

### OAuth コールバックエンドポイント

```typescript
// GET /oauth/github/callback
// GitHubからの認可コールバックを処理
app.get('/oauth/github/callback', async c => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  const result = await oauthHandler.handleCallback(code, state, error)

  if (result.success) {
    return c.json({ success: true, user: result.user })
  } else {
    return c.json({ success: false, error: result.error }, 400)
  }
})
```

## 実装パターン

### Authorization Code Flow + PKCE

```typescript
// 完全なOAuth 2.1フロー実装
class GitHubOAuthHandler {
  async startAuthFlow(userId?: string): Promise<AuthFlowStart> {
    // 1. 状態とPKCEパラメータ生成
    const pkceParams = await generatePKCEParams(128)
    const state = generateRandomString(32)

    // 2. 状態の保存
    const oauthState = await this.stateManager.createState(userId, pkceParams)

    // 3. 認可URL生成
    const authUrl = createAuthorizationUrl(this.config, state, pkceParams)

    return { authUrl, state: oauthState.state, sessionId: oauthState.sessionId }
  }

  async handleCallback(code: string, state: string): Promise<OAuthFlowResult> {
    // 1. 状態の検証と取得
    const oauthState = this.stateManager.consumeState(state)
    if (!oauthState || !validateOAuthState(oauthState, state, Date.now()).valid) {
      return createErrorResult('invalid_state', 'Invalid or expired state')
    }

    // 2. 認可コードをアクセストークンに交換
    const accessToken = await this.exchangeCodeForToken(code, state, oauthState.codeVerifier)

    // 3. ユーザー情報取得
    const user = await this.fetchUserInfo(accessToken.accessToken)

    return createSuccessResult(accessToken, user)
  }
}
```

### デバイスフロー実装

```typescript
// CLI/IoTアプリケーション向けデバイスフロー
const startDeviceFlow = async (): Promise<DeviceFlowInfo> => {
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: config.scopes.join(' '),
  })

  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

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

// デバイス認証のポーリング
const pollDeviceAuth = async (deviceCode: string): Promise<AccessToken> => {
  while (true) {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: config.clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    const data = await response.json()

    if (data.access_token) {
      return parseAccessToken(data)
    }

    if (data.error === 'authorization_pending') {
      await new Promise(resolve => setTimeout(resolve, interval * 1000))
      continue
    }

    throw new Error(`Device flow failed: ${data.error}`)
  }
}
```

### リフレッシュトークン処理

```typescript
// アクセストークンの更新
const refreshAccessToken = async (refreshToken: string): Promise<GitHubAccessToken> => {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
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

  const data = await response.json()

  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error}`)
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type || 'bearer',
    scope: parseScopes(data.scope),
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    issuedAt: Date.now(),
  }
}
```

## GitHub API連携

### ユーザー情報取得

```typescript
// GitHub API v3 ユーザー情報取得
const fetchUserInfo = async (accessToken: string): Promise<GitHubUser> => {
  const request = createGitHubAPIRequest('/user', accessToken)
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
  })

  if (!response.ok) {
    throw new Error(`User info fetch failed: ${response.status}`)
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
    publicRepos: userData.public_repos,
    followers: userData.followers,
    following: userData.following,
    createdAt: userData.created_at,
    updatedAt: userData.updated_at,
  }
}
```

### リポジトリ情報取得

```typescript
// ユーザーのリポジトリ一覧
const fetchUserRepositories = async (
  accessToken: string,
  username: string
): Promise<GitHubRepository[]> => {
  const request = createGitHubAPIRequest(`/users/${username}/repos`, accessToken)
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
  })

  return await response.json()
}
```

## テスト戦略

### OAuthフローテスト

```typescript
describe('GitHub OAuth Flow', () => {
  it('should complete authorization code flow with PKCE', async () => {
    // Given: PKCE対応のOAuthハンドラー
    const handler = new GitHubOAuthHandler(pkceEnabledConfig)

    // When: 認可フローを開始
    const { authUrl, state } = await handler.startAuthFlow('test-user')

    // Then: PKCEパラメータが含まれる
    expect(authUrl).toContain('code_challenge=')
    expect(authUrl).toContain('code_challenge_method=S256')

    // When: コールバックを処理
    const result = await handler.handleCallback('auth_code_123', state)

    // Then: 認証が成功
    expect(result.success).toBe(true)
    expect(result.user?.login).toBe('testuser')
  })
})
```

### セキュリティテスト

```typescript
describe('OAuth Security', () => {
  it('should prevent CSRF attacks with state validation', async () => {
    const handler = new GitHubOAuthHandler(config)

    // 正当な状態での成功
    const { state } = await handler.startAuthFlow()
    const validResult = await handler.handleCallback('code', state)
    expect(validResult.success).toBe(true)

    // 不正な状態での失敗
    const invalidResult = await handler.handleCallback('code', 'invalid_state')
    expect(invalidResult.success).toBe(false)
    expect(invalidResult.error?.error).toBe('invalid_state')
  })

  it('should handle state expiration', async () => {
    const handler = new GitHubOAuthHandler({ ...config, sessionTimeout: 1 })
    const { state } = await handler.startAuthFlow()

    // 時間経過をシミュレート
    await new Promise(resolve => setTimeout(resolve, 1100))

    const result = await handler.handleCallback('code', state)
    expect(result.success).toBe(false)
    expect(result.error?.error).toBe('invalid_state')
  })
})
```

### PKCEテスト

```typescript
describe('PKCE Implementation', () => {
  it('should generate secure PKCE parameters', async () => {
    const pkceParams = await generatePKCEParams(128)

    expect(pkceParams.codeVerifier).toHaveLength(128)
    expect(pkceParams.codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(pkceParams.codeChallengeMethod).toBe('S256')
  })
})
```

## 設定オプション

### 環境変数

- `GITHUB_CLIENT_ID`: GitHub OAuth アプリのクライアントID（必須）
- `GITHUB_CLIENT_SECRET`: GitHub OAuth アプリのクライアントシークレット（必須）
- `GITHUB_REDIRECT_URI`: リダイレクトURI（必須）
- `GITHUB_SCOPES`: 要求するスコープ（カンマ区切り）
- `GITHUB_ENABLE_PKCE`: PKCE有効化（推奨：true）
- `GITHUB_ALLOW_SIGNUP`: サインアップ許可
- `GITHUB_SESSION_TIMEOUT`: セッション有効期限（秒）
- `GITHUB_ENABLE_DEVICE_FLOW`: デバイスフロー有効化

### プラグイン設定

```typescript
const githubOAuthPlugin = createGitHubOAuthPlugin({
  clientId: 'your_github_client_id',
  clientSecret: 'your_github_client_secret',
  redirectUri: 'https://your-app.com/oauth/github/callback',
  scopes: ['read:user', 'user:email', 'public_repo'],
  allowSignup: true,
  enablePKCE: true,
  stateLength: 32,
  codeVerifierLength: 128,
  sessionTimeout: 3600,
  enableWebhooks: false,
  enableDeviceFlow: false,
})
```

### GitHub OAuth アプリ設定

1. GitHub → Settings → Developer settings → OAuth Apps
2. **Authorization callback URL**: `https://your-domain.com/oauth/github/callback`
3. **Application name**: アプリケーション名
4. **Homepage URL**: アプリケーションのホームページ
5. **Application description**: アプリケーションの説明

### スコープ一覧

- `read:user`: 公開およびプライベートプロフィール情報の読み取り
- `user:email`: ユーザーのメールアドレスへのアクセス
- `public_repo`: パブリックリポジトリへのアクセス
- `repo`: プライベートリポジトリを含む完全なリポジトリアクセス
- `admin:org`: 組織およびチームの完全なアクセス
- `gist`: Gistの読み書きアクセス
- `notifications`: 通知へのアクセス

## セキュリティ考慮事項

1. **PKCE (Proof Key for Code Exchange)**: 認可コードインターセプト攻撃を防ぐ
2. **State Parameter**: CSRF攻撃を防ぐためのランダム状態検証
3. **HTTPS Required**: 本番環境では必ずHTTPS使用
4. **Token Storage**: アクセストークンの安全な保存
5. **Scope Limitation**: 最小権限の原則でスコープを制限
6. **Session Timeout**: 適切なセッション有効期限設定

## 学習ポイント

1. **OAuth 2.1準拠**: 最新のOAuth仕様に基づく実装
2. **PKCE実装**: セキュリティ強化のためのPKCE対応
3. **関数型設計**: 純粋関数による予測可能なフロー
4. **状態管理**: 不変データ構造による安全な状態操作
5. **エラーハンドリング**: 包括的なエラー処理と回復
