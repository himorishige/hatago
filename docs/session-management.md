# Session Management in Hatago

This document explains Hatago's secure session management system for multi-user MCP servers.

## Overview

Hatago implements a comprehensive session management system that provides:

- **Multi-user isolation**: Each user has their own secure session
- **Session rotation**: Automatic ID rotation on authentication to prevent session fixation attacks
- **Plugin namespace isolation**: Plugins cannot access each other's data
- **Transport lifecycle management**: Automatic cleanup of resources
- **Runtime-agnostic design**: Works across Node.js, Cloudflare Workers, Deno, and Bun

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Request                             │
│                                                             │
│  mcp-session-id: abc123                                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 MCP Setup Layer                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              SessionManager                         │    │
│  │                                                     │    │
│  │  ┌─────────────┐  ┌─────────────────────────────┐    │    │
│  │  │  Transport  │  │       SessionData           │    │    │
│  │  │             │  │                             │    │    │
│  │  │  ┌────────┐ │  │  ┌─────────────────────────┐ │    │    │
│  │  │  │Cleanup │ │  │  │   Plugin Namespaces     │ │    │    │
│  │  │  │ Logic  │ │  │  │                         │ │    │    │
│  │  │  └────────┘ │  │  │ plugin:oauth:token      │ │    │    │
│  │  └─────────────┘  │  │ plugin:auth:state       │ │    │    │
│  │                   │  │ plugin:cache:data       │ │    │    │
│  │                   │  └─────────────────────────┘ │    │    │
│  │                   └─────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Plugin Layer                              │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   OAuth     │  │    Auth     │  │   Cache     │          │
│  │   Plugin    │  │   Plugin    │  │   Plugin    │          │
│  │             │  │             │  │             │          │
│  │ Isolated    │  │ Isolated    │  │ Isolated    │          │
│  │ Namespace   │  │ Namespace   │  │ Namespace   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Core Classes

#### SessionManager

The `SessionManager` class is the heart of the system, providing unified management of transport and session data:

```typescript
class SessionManager {
  // Create new session with transport
  createSession(): SessionRecord

  // Get session with TTL validation
  getSession(sessionId: string): SessionRecord | undefined

  // Rotate session ID (security)
  rotateSession(oldId: string, newId: string): boolean

  // Plugin data management
  setPluginData(sessionId: string, key: string, data: unknown): boolean
  getPluginData(sessionId: string, key: string): unknown
  deletePluginData(sessionId: string, key: string): boolean
}
```

#### MCPSessionContext

Provides session access to MCP tools:

```typescript
interface MCPSessionContext {
  sessionId: string | undefined
  sessionStore: {
    get: (sessionId: string) => SessionData | undefined
    setPluginData: (sessionId: string, key: string, data: unknown) => void
    getPluginData: (sessionId: string, key: string) => unknown
    deletePluginData: (sessionId: string, key: string) => void
    rotateSession: (oldId: string, newId: string) => boolean
  }
}
```

#### PluginSessionContext

Provides namespace-isolated session access to plugins:

```typescript
interface PluginSessionContext {
  sessionId: string | undefined
  sessionStore: {
    set: (key: string, data: unknown) => void
    get: (key: string) => unknown
    delete: (key: string) => void
  }
}
```

## Security Features

### Session Fixation Prevention

Hatago automatically rotates session IDs during authentication to prevent session fixation attacks:

```typescript
// Example: OAuth plugin rotating session on auth success
const oldSessionId = pluginSession.sessionId!
const newSessionId = generateSessionId()
const rotated = mainSessionContext.sessionStore.rotateSession(oldSessionId, newSessionId)

if (rotated) {
  // Return new session ID to client
  return c.json(
    {
      success: true,
      newSessionId: newSessionId,
      accessToken: 'at_12345',
    },
    200,
    {
      'X-Session-Rotated': 'true',
      'X-New-Session-Id': newSessionId,
    }
  )
}
```

### Plugin Namespace Isolation

Each plugin gets its own isolated namespace using the pattern `plugin:{pluginId}:{key}`:

```typescript
// Plugin 1 data
pluginSession.sessionStore.set('token', 'oauth-token')
// Stored as: plugin:oauth:token

// Plugin 2 data
pluginSession.sessionStore.set('token', 'auth-token')
// Stored as: plugin:auth:token

// These are completely isolated
```

### Cryptographically Secure Session IDs

Session IDs are generated using `crypto.getRandomValues()` with 256-bit entropy:

```typescript
export function generateSessionId(): string {
  const bytes = new Uint8Array(32) // 256-bit
  crypto.getRandomValues(bytes)

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

### No Session ID Logging

Session IDs are never logged to prevent information disclosure:

```typescript
// Good: Generic session operation logging
logger.info('Session rotated for security', {
  reason: 'authentication_upgrade',
  totalSessions: this.sessions.size,
})

// Bad: Never do this
logger.info('Session rotated', { sessionId }) // ❌ NEVER LOG SESSION IDS
```

## Usage Examples

### Basic Session Usage

```typescript
import { createApp } from '@hatago/core'
import { createPluginSessionContext } from '@hatago/core'

const myPlugin = async ctx => {
  ctx.server.registerTool('store_data', async request => {
    // Get plugin-scoped session context
    const pluginSession = createPluginSessionContext(ctx.server, 'my-plugin')

    if (!pluginSession.sessionId) {
      throw new Error('No active session')
    }

    // Store data in plugin's namespace
    pluginSession.sessionStore.set('user_data', request.params.data)

    return { success: true }
  })
}

const { app } = await createApp({
  plugins: [myPlugin],
})
```

### OAuth Integration with Session Rotation

```typescript
const oauthPlugin = async ctx => {
  ctx.app.post('/auth/callback', async c => {
    const { code, state } = await c.req.json()
    const pluginSession = createPluginSessionContext(ctx.server, 'oauth')

    // Verify state parameter
    const storedState = pluginSession.sessionStore.get('oauth_state')
    if (state !== storedState) {
      return c.json({ error: 'Invalid state' }, 400)
    }

    // Exchange code for token
    const token = await exchangeCodeForToken(code)

    // SECURITY: Rotate session ID after authentication
    const oldSessionId = pluginSession.sessionId!
    const newSessionId = generateSessionId()

    // This preserves all plugin data but changes the session ID
    const rotated = mainSessionContext.sessionStore.rotateSession(oldSessionId, newSessionId)

    if (rotated) {
      return c.json(
        {
          success: true,
          newSessionId: newSessionId,
          accessToken: token,
        },
        200,
        {
          'X-Session-Rotated': 'true',
          'X-New-Session-Id': newSessionId,
        }
      )
    }

    return c.json({ error: 'Session rotation failed' }, 500)
  })
}
```

### Multi-User Data Isolation

```typescript
const userDataPlugin = async ctx => {
  ctx.server.registerTool('get_user_profile', async request => {
    const pluginSession = createPluginSessionContext(ctx.server, 'user-data')

    // Each session (user) has completely isolated data
    const profile = pluginSession.sessionStore.get('profile')

    if (!profile) {
      throw new Error('No user profile found')
    }

    return { profile }
  })

  ctx.server.registerTool('set_user_profile', async request => {
    const pluginSession = createPluginSessionContext(ctx.server, 'user-data')

    // This data is only accessible to this specific session
    pluginSession.sessionStore.set('profile', request.params.profile)

    return { success: true }
  })
}
```

## Configuration

### SessionManager Configuration

```typescript
const sessionManager = new SessionManager({
  ttlMs: 30 * 60 * 1000, // 30 minutes session timeout
  cleanupIntervalMs: 60 * 1000, // Cleanup expired sessions every minute
  maxSessions: 1000, // Maximum concurrent sessions
})
```

### Environment Variables

- `HATAGO_TRANSPORT`: Transport mode (`stdio` | `http`) - default: `http`
- `LOG_LEVEL`: Logging level for session operations
- `REQUIRE_AUTH`: Set to `"true"` to enforce authentication

## Best Practices

### For Plugin Developers

1. **Always check for active session**:

   ```typescript
   if (!pluginSession.sessionId) {
     throw new Error('Authentication required')
   }
   ```

2. **Use descriptive key names**:

   ```typescript
   // Good
   pluginSession.sessionStore.set('oauth_access_token', token)
   pluginSession.sessionStore.set('user_preferences', prefs)

   // Avoid generic names that might conflict
   pluginSession.sessionStore.set('data', value) // ❌ Too generic
   ```

3. **Clean up sensitive data**:

   ```typescript
   // Remove sensitive data when no longer needed
   pluginSession.sessionStore.delete('oauth_refresh_token')
   ```

4. **Implement session rotation on authentication**:
   ```typescript
   // Always rotate session ID after successful authentication
   const rotated = mainSessionContext.sessionStore.rotateSession(oldId, newId)
   ```

### For Application Developers

1. **Configure appropriate session timeouts**:

   ```typescript
   // Shorter TTL for high-security applications
   const sessionManager = new SessionManager({
     ttlMs: 15 * 60 * 1000, // 15 minutes
   })
   ```

2. **Monitor session metrics**:

   ```typescript
   // Log session statistics for monitoring
   logger.info('Session metrics', {
     activeSessions: sessionManager.size(),
     maxSessions: config.maxSessions,
   })
   ```

3. **Handle session rotation on client side**:
   ```typescript
   // Check for session rotation headers
   if (response.headers.get('X-Session-Rotated')) {
     const newSessionId = response.headers.get('X-New-Session-Id')
     // Update client to use new session ID
   }
   ```

## Troubleshooting

### Common Issues

#### Session Not Persisting

**Problem**: Data is lost between requests.

**Solution**: Ensure the client is sending the `mcp-session-id` header:

```bash
curl -H "mcp-session-id: your-session-id" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"your_tool"}' \
     http://localhost:8787/mcp
```

#### Plugin Data Isolation Issues

**Problem**: One plugin can see another plugin's data.

**Solution**: Check that you're using `createPluginSessionContext` with unique plugin IDs:

```typescript
// Ensure unique plugin IDs
const plugin1Session = createPluginSessionContext(server, 'oauth-plugin')
const plugin2Session = createPluginSessionContext(server, 'user-data-plugin')
```

#### Session Rotation Not Working

**Problem**: Session fixation vulnerability remains.

**Solution**: Verify you have access to the main session context:

```typescript
// Get main session context for rotation
const mainSessionContext = server.getSessionContext() as MCPSessionContext
const rotated = mainSessionContext.sessionStore.rotateSession(oldId, newId)
```

#### Memory Leaks

**Problem**: Server memory usage keeps growing.

**Solution**: Check session cleanup configuration:

```typescript
const sessionManager = new SessionManager({
  ttlMs: 30 * 60 * 1000, // Reasonable timeout
  cleanupIntervalMs: 60 * 1000, // Regular cleanup
  maxSessions: 1000, // Reasonable limit
})
```

### Debug Mode

Enable debug logging to troubleshoot session issues:

```bash
LOG_LEVEL=debug pnpm dev
```

This will show detailed session operations:

```
[session-manager] Session created {"totalSessions":1,"expiresAt":"2025-08-18T01:51:19.605Z"}
[session-manager] Session rotated for security {"reason":"authentication_upgrade","totalSessions":1}
[session-manager] Session deleted {"totalSessions":0}
```

## Testing

Hatago includes comprehensive session management tests. Run them with:

```bash
# All session tests
pnpm test session

# Specific test suites
pnpm test session-manager.test.ts
pnpm test plugin-isolation.test.ts
pnpm test session-rotation.test.ts
pnpm test security-integration.test.ts
```

## Related Documentation

- [Security Best Practices](./security.md)
- [Plugin Development Guide](./guides/plugin-development.md)
- [Architecture Overview](./architecture.md)
- [API Reference](./api-reference.md)
