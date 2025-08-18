/**
 * Type definitions for GitHub OAuth plugin
 */

/**
 * GitHub token structure
 */
export interface GitHubToken {
  access_token: string
  token_type: string
  scope?: string
  expires_at?: number
}

/**
 * GitHub OAuth configuration for traditional flow
 */
export interface GitHubOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
  userAgent?: string
}

/**
 * GitHub Device Flow configuration
 */
export interface GitHubDeviceFlowConfig {
  clientId: string
  clientSecret?: string // Not required for device flow, but may be needed for future
  scope?: string
  sessionTTL?: number // Default: 900 seconds (15 minutes)
  idleTimeout?: number // Default: 300 seconds (5 minutes)
}

/**
 * Device authentication session
 */
export interface DeviceAuthSession {
  id: string // 128bit CSPRNG generated ID
  deviceCode?: string // GitHub device code (temporary)
  userCode?: string // User display code
  githubToken?: GitHubToken // Access token
  userId?: string // GitHub user ID/login
  sessionRotated?: boolean // Whether session ID was rotated after authentication
  createdAt: number
  lastAccessedAt: number
  expiresAt: number
}

/**
 * Device code response from GitHub
 */
export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

/**
 * Access token response from GitHub
 */
export interface AccessTokenResponse {
  access_token?: string
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
  error_uri?: string
}

/**
 * GitHub user information
 */
export interface GitHubUser {
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string
  url: string
  html_url: string
  followers_url: string
  following_url: string
  gists_url: string
  starred_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: string
  received_events_url: string
  type: string
  site_admin: boolean
  name?: string
  company?: string
  blog?: string
  location?: string
  email?: string
  hireable?: boolean
  bio?: string
  twitter_username?: string
  public_repos: number
  public_gists: number
  followers: number
  following: number
  created_at: string
  updated_at: string
}
