/**
 * Type definitions for Hatago Auth POC
 */

export interface Env {
  // Durable Objects
  STDIO_BRIDGE: DurableObjectNamespace

  // KV Storage
  OAUTH_KV: KVNamespace

  // D1 Database
  PERMISSIONS_DB: D1Database

  // OAuth Provider helpers (automatically injected by OAuthProvider)
  OAUTH_PROVIDER: any

  // Environment variables
  AUTH_TYPE: 'mock' | 'cloudflare-access' | 'github'
  LOG_LEVEL: string
  ENVIRONMENT: 'development' | 'production'

  // OAuth credentials (Cloudflare Access)
  ACCESS_CLIENT_ID?: string
  ACCESS_CLIENT_SECRET?: string
  ACCESS_AUTHORIZATION_URL?: string
  ACCESS_TOKEN_URL?: string
  ACCESS_JWKS_URL?: string

  // OAuth credentials (GitHub)
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string

  // Service Token
  SERVICE_CLIENT_ID?: string
  SERVICE_CLIENT_SECRET?: string

  // Cookie encryption
  COOKIE_ENCRYPTION_KEY?: string
}

export interface AuthContext {
  claims: {
    sub: string
    email?: string
    name?: string
    groups?: string[]
    permissions?: string[]
  }
  accessToken: string
  refreshToken?: string
}

export interface UserPermissions {
  userId: string
  servers: string[]
  permissions: string[]
  groups: string[]
}
