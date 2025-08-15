# OAuth Authentication for MCP Wrapper

This plugin supports OAuth authentication for external MCP servers using HTTP transport.

## Phase 1: Basic Token Authentication (Current)

### Environment Variable Configuration

The simplest way to authenticate is using environment variables:

#### GitHub

```bash
# Using Personal Access Token
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx

# Or using OAuth client credentials
export PLUGIN_NAME_OAUTH_CLIENT_ID=your_client_id
export PLUGIN_NAME_OAUTH_CLIENT_SECRET=your_client_secret
```

#### Google

```bash
# Using API Key
export GOOGLE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Or using OAuth token
export GOOGLE_ACCESS_TOKEN=ya29.XXXXXXXXXXXXXXXXX
export GOOGLE_REFRESH_TOKEN=1//XXXXXXXXXXXXXXXXX

# Or using OAuth client credentials
export PLUGIN_NAME_GOOGLE_CLIENT_ID=your_client_id
export PLUGIN_NAME_GOOGLE_CLIENT_SECRET=your_client_secret
```

#### Slack

```bash
# Using Bot Token
export SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx

# Or using User Token
export SLACK_USER_TOKEN=xoxp-xxxxxxxxxxxx

# Or using App Token
export SLACK_APP_TOKEN=xapp-xxxxxxxxxxxx

# Or using OAuth client credentials
export PLUGIN_NAME_SLACK_CLIENT_ID=your_client_id
export PLUGIN_NAME_SLACK_CLIENT_SECRET=your_client_secret
```

### Configuration

In your plugin configuration:

```typescript
{
  transport: 'http',
  http: {
    endpoint: 'https://api.github.com/mcp',
    auth: {
      type: 'oauth',
      oauth: {
        provider: 'github',
        tokenStorage: 'file',  // Store tokens securely
        autoRefresh: true
      }
    }
  }
}
```

### Token Storage Options

- **memory**: Tokens stored in memory (lost on restart)
- **file**: Tokens stored in encrypted file at `~/.hatago/tokens.json`
- **keychain**: (Future) OS keychain integration

## Supported Providers

### GitHub

- Personal Access Tokens (PAT)
- OAuth Apps (client credentials required)
- No refresh token support (tokens don't expire)

### Google

- API Keys support
- OAuth 2.0 with refresh tokens
- OpenID Connect (ID tokens)
- Automatic token refresh
- Service Account support (future)

### Slack

- Bot tokens (xoxb-)
- User tokens (xoxp-)
- App-level tokens (xapp-)
- No PKCE support (Slack limitation)
- Webhook integration

### Azure (Coming Soon)

- Azure AD integration
- Managed Identity support

## Security Best Practices

1. **Never commit tokens to version control**
2. **Use environment variables for sensitive data**
3. **Enable token encryption for file storage**
4. **Rotate tokens regularly**
5. **Use minimal scopes required**

## Phase 2: OAuth Flow (Coming Soon)

Full OAuth 2.0 flow with:

- Authorization Code + PKCE
- Automatic token refresh
- Browser-based authentication
- Dynamic client registration

## Phase 3: MCP Spec Compliance (Future)

Full compliance with MCP OAuth specification:

- RFC 9728 resource metadata discovery
- RFC 8414 authorization server metadata
- RFC 7591 dynamic client registration
- Resource indicators (RFC 8707)

## Troubleshooting

### Token Not Found

```
Error: No GitHub token available
```

**Solution**: Set `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable

### Invalid Token

```
Error: 401 Unauthorized
```

**Solution**: Verify token has correct scopes and hasn't been revoked

### Token Expired

```
Error: Token expired
```

**Solution**: For providers with refresh tokens, ensure `autoRefresh` is enabled

## API Usage Examples

### GitHub Integration

```typescript
const client = new MCPClient({
  transport: 'http',
  http: {
    endpoint: 'https://api.github.com/mcp',
    auth: {
      type: 'oauth',
      oauth: {
        provider: 'github',
        scope: 'repo read:org read:user',
      },
    },
  },
})

// Token is automatically included in requests
await client.connect()
const tools = await client.listTools()
```

### Google Integration

```typescript
const client = new MCPClient({
  transport: 'http',
  http: {
    endpoint: 'https://googleapis.com/mcp',
    auth: {
      type: 'oauth',
      oauth: {
        provider: 'google',
        scope: 'openid profile email',
        accessType: 'offline', // For refresh tokens
        autoRefresh: true,
      },
    },
  },
})

await client.connect()
// Token will auto-refresh when expired
```

### Slack Integration

```typescript
const client = new MCPClient({
  transport: 'http',
  http: {
    endpoint: 'https://slack.com/api/mcp',
    auth: {
      type: 'oauth',
      oauth: {
        provider: 'slack',
        scope: 'channels:read chat:write users:read',
      },
    },
  },
})

await client.connect()
// Bot token is used for API calls
```

## Development

### Testing OAuth

```bash
# Test with mock token
export GITHUB_PERSONAL_ACCESS_TOKEN=test_token_12345
npm test

# Test with real token
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_real_token
npm run test:integration
```

### Adding New Providers

1. Create provider file in `oauth/providers/`
2. Implement OAuth flow specifics
3. Add to provider registry
4. Update documentation

## Migration Guide

### From Simple Bearer Token

```typescript
// Before
{
  auth: {
    type: 'bearer',
    token: 'xxx'
  }
}

// After
{
  auth: {
    type: 'oauth',
    oauth: {
      provider: 'github'
    }
  }
}
// Token now from environment variable
```

### From No Authentication

```typescript
// Before
{
  transport: 'http',
  endpoint: 'http://localhost:3001/mcp'
}

// After
{
  transport: 'http',
  endpoint: 'https://api.github.com/mcp',
  auth: {
    type: 'oauth',
    oauth: {
      provider: 'github'
    }
  }
}
```
