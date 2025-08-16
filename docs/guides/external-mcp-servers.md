# External MCP Server Integration

Connect external MCP servers to Hatago to extend functionality.

## Overview

Hatago can proxy requests to external MCP servers, allowing you to:

- Use existing MCP servers without modification
- Combine multiple MCP servers into one endpoint
- Add namespace prefixes to avoid tool conflicts

## Quick Start

### 1. Configure External Server

Create or update `hatago.config.json`:

```json
{
  "proxy": {
    "servers": [
      {
        "id": "my-external-server",
        "endpoint": "http://localhost:8080/mcp",
        "namespace": "external"
      }
    ]
  }
}
```

### 2. Start Hatago

```bash
pnpm dev
```

External server tools are now available with the `external:` prefix.

### 3. Test Integration

```bash
# List all tools (including external)
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Configuration Options

### Basic Server Configuration

```json
{
  "proxy": {
    "servers": [
      {
        "id": "server-id", // Unique identifier
        "endpoint": "http://...", // MCP endpoint URL
        "namespace": "prefix", // Tool namespace prefix
        "description": "..." // Optional description
      }
    ]
  }
}
```

### Authentication

#### Bearer Token

```json
{
  "auth": {
    "type": "bearer",
    "token": "${API_TOKEN}" // From environment variable
  }
}
```

#### Basic Auth

```json
{
  "auth": {
    "type": "basic",
    "username": "user",
    "password": "${PASSWORD}"
  }
}
```

#### Custom Headers

```json
{
  "auth": {
    "type": "custom",
    "headers": {
      "X-API-Key": "${API_KEY}"
    }
  }
}
```

### Tool Filtering

Control which tools are exposed:

```json
{
  "tools": {
    "include": ["calc.*", "time.*"], // Only these patterns
    "exclude": ["debug.*"], // Exclude these patterns
    "rename": {
      // Rename specific tools
      "oldName": "newName"
    }
  }
}
```

### Health Monitoring

Enable automatic health checks:

```json
{
  "healthCheck": {
    "enabled": true,
    "interval": 30000, // Check every 30 seconds
    "timeout": 5000 // 5 second timeout
  }
}
```

## Namespace Management

### Strategies

Control how namespaces are applied:

```json
{
  "namespaceStrategy": "prefix", // tool -> namespace:tool
  "conflictResolution": "error" // How to handle conflicts
}
```

Options:

- `namespaceStrategy`: `"prefix"` | `"suffix"` | `"none"`
- `conflictResolution`: `"error"` | `"rename"` | `"skip"`

### Avoiding Conflicts

When multiple servers provide tools with the same name:

```json
{
  "proxy": {
    "servers": [
      {
        "id": "server1",
        "namespace": "s1",
        "endpoint": "http://server1.com/mcp"
      },
      {
        "id": "server2",
        "namespace": "s2",
        "endpoint": "http://server2.com/mcp"
      }
    ],
    "conflictResolution": "rename" // Auto-rename conflicts
  }
}
```

## Examples

### Multiple External Servers

```json
{
  "proxy": {
    "servers": [
      {
        "id": "weather",
        "endpoint": "http://weather-api.com/mcp",
        "namespace": "weather",
        "auth": {
          "type": "bearer",
          "token": "${WEATHER_TOKEN}"
        }
      },
      {
        "id": "database",
        "endpoint": "http://db-server.local/mcp",
        "namespace": "db",
        "tools": {
          "include": ["query", "update"],
          "exclude": ["admin.*"]
        }
      }
    ]
  }
}
```

### Development vs Production

```json
{
  "proxy": {
    "servers": [
      {
        "id": "api",
        "endpoint": "${MCP_ENDPOINT:http://localhost:8080/mcp}",
        "auth": {
          "type": "bearer",
          "token": "${API_TOKEN}"
        },
        "healthCheck": {
          "enabled": "${NODE_ENV}" === "production",
          "interval": 60000
        }
      }
    ]
  }
}
```

## Testing External Servers

### Direct Test

Test external server directly:

```bash
# Test external server
curl -X POST http://external-server:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Through Hatago

Test through Hatago proxy:

```bash
# Tools will have namespace prefix
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call namespaced tool
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"external:tool_name",
      "arguments":{}
    }
  }'
```

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to external server

**Solutions**:

1. Verify server is running: `curl http://external-server/health`
2. Check network connectivity
3. Verify endpoint URL in configuration
4. Check firewall/proxy settings

### Tool Not Found

**Problem**: External tools not appearing

**Solutions**:

1. Check namespace prefix is being used
2. Verify tool filtering rules
3. Check server returns tools correctly
4. Look for conflicts with existing tools

### Authentication Errors

**Problem**: 401/403 errors from external server

**Solutions**:

1. Verify credentials in environment variables
2. Check authentication type matches server
3. Test with curl using same credentials
4. Check token expiration

## Environment Variables

Use environment variables for sensitive data:

```bash
# .env file
MCP_ENDPOINT=http://api.example.com/mcp
API_TOKEN=secret-token
NODE_ENV=development
```

Reference in configuration:

```json
{
  "endpoint": "${MCP_ENDPOINT}",
  "auth": {
    "token": "${API_TOKEN}"
  }
}
```

## Performance Tips

1. **Enable health checks** to detect failures early
2. **Use connection timeouts** to prevent hanging requests
3. **Filter unnecessary tools** to reduce overhead
4. **Cache tool lists** with appropriate TTL

## Security Considerations

1. **Never commit secrets** - Use environment variables
2. **Use HTTPS** for production endpoints
3. **Validate certificates** in production
4. **Limit tool exposure** with filtering
5. **Monitor access logs** for unusual activity

## Advanced Topics

### Custom Namespace Logic

Create a plugin for custom namespace handling:

```typescript
export const customNamespacePlugin: HatagoPlugin = ctx => {
  // Custom namespace logic
}
```

### Dynamic Server Registration

Add servers programmatically:

```typescript
export const dynamicProxyPlugin: HatagoPlugin = ctx => {
  // Register external servers based on runtime conditions
}
```

### Response Transformation

Transform external server responses:

```typescript
export const transformPlugin: HatagoPlugin = ctx => {
  // Intercept and transform responses
}
```

## Next Steps

- Review [example configurations](https://github.com/himorishige/hatago/tree/main/apps)
- Learn about [plugin development](./plugin-development.md)
- Check [API reference](../api-reference.md)
