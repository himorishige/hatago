# External MCP Server Integration Guide

This document explains how to integrate external MCP servers with Hatago using the enhanced proxy system and namespace management.

## Overview

Hatago provides a powerful system for connecting to external MCP servers with:
- **Configuration-based management** via `hatago.config.json`
- **Advanced namespace management** to avoid tool name conflicts
- **Flexible tool filtering and renaming**
- **Health monitoring and connection pooling**

## Quick Start

### 1. Basic Configuration

Create or update `hatago.config.json` in your server directory:

```json
{
  "proxy": {
    "servers": [
      {
        "id": "my-external-server",
        "endpoint": "http://localhost:8888",
        "namespace": "external",
        "description": "My external MCP server"
      }
    ],
    "namespaceStrategy": "prefix",
    "conflictResolution": "error"
  }
}
```

### 2. Start Hatago

```bash
pnpm dev
```

Hatago will automatically:
- Connect to the external server
- Register all tools with the `external:` namespace prefix
- Handle authentication and health checks

## Configuration Reference

### Server Configuration

```json
{
  "id": "unique-server-id",
  "endpoint": "http://external-server:8080",
  "namespace": "custom-namespace",
  "description": "Human-readable description",
  "tools": {
    "rename": {
      "original.tool": "newName"
    },
    "include": ["pattern1", "pattern2"],
    "exclude": ["unwanted.*"]
  },
  "auth": {
    "type": "bearer",
    "token": "${API_TOKEN}"
  },
  "timeout": 30000,
  "healthCheck": {
    "enabled": true,
    "interval": 30000,
    "timeout": 5000
  }
}
```

#### Server Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique identifier for the server |
| `endpoint` | string | ✅ | MCP server endpoint URL |
| `namespace` | string | ❌ | Custom namespace (defaults to `id`) |
| `description` | string | ❌ | Human-readable description |
| `tools` | object | ❌ | Tool filtering and renaming configuration |
| `auth` | object | ❌ | Authentication configuration |
| `timeout` | number | ❌ | Request timeout in milliseconds (default: 30000) |
| `healthCheck` | object | ❌ | Health monitoring configuration |

### Tool Configuration

#### Renaming Tools

```json
"tools": {
  "rename": {
    "original.toolName": "newToolName",
    "another.tool": "renamedTool"
  }
}
```

#### Filtering Tools

```json
"tools": {
  "include": ["math.*", "time.*"],  // Only include matching patterns
  "exclude": ["debug.*", "internal.*"]  // Exclude matching patterns
}
```

Patterns support wildcards:
- `*` matches any characters
- `math.*` matches `math.add`, `math.subtract`, etc.
- `debug.*` matches `debug.log`, `debug.trace`, etc.

### Authentication

#### Bearer Token

```json
"auth": {
  "type": "bearer",
  "token": "${API_TOKEN}"  // Environment variable expansion
}
```

#### Basic Authentication

```json
"auth": {
  "type": "basic",
  "username": "user",
  "password": "${PASSWORD}"
}
```

#### Custom Headers

```json
"auth": {
  "type": "custom",
  "headers": {
    "X-API-Key": "${API_KEY}",
    "X-Client-ID": "hatago"
  }
}
```

### Namespace Management

#### Namespace Strategies

```json
"namespaceStrategy": "prefix"  // tool -> namespace:tool
"namespaceStrategy": "suffix"  // tool -> tool:namespace
"namespaceStrategy": "custom"  // Custom implementation
```

#### Conflict Resolution

```json
"conflictResolution": "error"   // Throw error on conflicts
"conflictResolution": "rename"  // Auto-rename conflicting tools
"conflictResolution": "skip"    // Skip conflicting tools
```

#### Advanced Namespace Settings

```json
"namespace": {
  "separator": ":",           // Namespace separator character
  "caseSensitive": false,     // Case-sensitive tool names
  "maxLength": 64,           // Maximum tool name length
  "autoPrefix": {
    "enabled": true,
    "format": "{server}_{index}"  // Auto-generated prefix format
  }
}
```

## Examples

### Example 1: Multiple Servers with Different Namespaces

```json
{
  "proxy": {
    "servers": [
      {
        "id": "time-server",
        "endpoint": "http://localhost:8788",
        "namespace": "time",
        "tools": {
          "rename": {
            "clock.getTime": "getCurrentTime"
          }
        }
      },
      {
        "id": "math-server", 
        "endpoint": "http://localhost:8789",
        "namespace": "calc",
        "tools": {
          "include": ["math.*"],
          "exclude": ["math.deprecated.*"]
        }
      }
    ],
    "namespaceStrategy": "prefix",
    "conflictResolution": "rename"
  }
}
```

Result:
- `time:getCurrentTime` (from time-server's `clock.getTime`)
- `calc:math.add` (from math-server's `math.add`)
- Conflicting tool names are automatically renamed

### Example 2: Authenticated External Service

```json
{
  "proxy": {
    "servers": [
      {
        "id": "weather-api",
        "endpoint": "https://weather-mcp.example.com",
        "namespace": "weather",
        "auth": {
          "type": "bearer",
          "token": "${WEATHER_API_KEY}"
        },
        "healthCheck": {
          "enabled": true,
          "interval": 60000
        }
      }
    ]
  }
}
```

### Example 3: Tool Filtering and Health Monitoring

```json
{
  "proxy": {
    "servers": [
      {
        "id": "dev-tools",
        "endpoint": "http://dev-server:8080",
        "namespace": "dev",
        "tools": {
          "include": ["*"],
          "exclude": ["admin.*", "dangerous.*"]
        },
        "healthCheck": {
          "enabled": true,
          "interval": 30000,
          "timeout": 10000
        },
        "timeout": 15000
      }
    ],
    "conflictResolution": "skip"
  }
}
```

## Environment Variables

Environment variables in configuration are expanded automatically:

```json
{
  "endpoint": "http://${SERVER_HOST}:${SERVER_PORT}",
  "auth": {
    "token": "${API_TOKEN}"
  }
}
```

Supported formats:
- `${VAR_NAME}` - Required variable
- `${VAR_NAME:default}` - Variable with default value

## Health Monitoring

Health checks automatically monitor external server availability:

```json
"healthCheck": {
  "enabled": true,
  "interval": 30000,    // Check every 30 seconds
  "timeout": 5000       // Timeout after 5 seconds
}
```

Failed health checks are logged but don't affect existing connections.

## Troubleshooting

### Common Issues

#### Connection Failures

```
Enhanced MCP Proxy: Failed to connect to server-id
```

**Solutions:**
1. Verify the external server is running
2. Check the endpoint URL in configuration
3. Verify authentication credentials
4. Check network connectivity

#### Tool Name Conflicts

```
Tool name conflict: toolName already exists from server1
```

**Solutions:**
1. Use different namespaces for servers
2. Set `conflictResolution: "rename"` 
3. Use tool renaming in configuration
4. Filter out conflicting tools with `exclude`

#### No Tools Registered

```
Enhanced MCP Proxy: Found 0 tools from server-id
```

**Solutions:**
1. Check tool filtering (`include`/`exclude` patterns)
2. Verify the external server exposes tools correctly
3. Test the external server directly with curl
4. Check server logs for initialization errors

### Debugging

#### Enable Detailed Logging

Set environment variable:
```bash
DEBUG=hatago:* pnpm dev
```

#### Test External Server Directly

```bash
curl -H "Content-Type: application/json" \\
     -H "Accept: application/json, text/event-stream" \\
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \\
     http://external-server:8080/mcp
```

#### Verify Configuration

Use the configuration loader to validate settings:

```bash
node -e "
const { loadConfig } = require('./dist/config/loader.js');
loadConfig().then(config => console.log(JSON.stringify(config, null, 2)));
"
```

## Best Practices

### 1. Use Descriptive Namespaces

```json
// Good
"namespace": "weather"
"namespace": "database"

// Avoid
"namespace": "srv1"
"namespace": "ext"
```

### 2. Configure Health Checks

Always enable health checks for production deployments:

```json
"healthCheck": {
  "enabled": true,
  "interval": 30000,
  "timeout": 10000
}
```

### 3. Use Environment Variables for Secrets

```json
// Good
"auth": {
  "token": "${API_TOKEN}"
}

// Never do this
"auth": {
  "token": "secret-token-here"
}
```

### 4. Filter Unnecessary Tools

Only expose tools you actually need:

```json
"tools": {
  "include": ["user.*", "data.*"],
  "exclude": ["admin.*", "debug.*"]
}
```

### 5. Plan for Conflicts

Use conflict resolution strategy appropriate for your use case:

```json
// For development
"conflictResolution": "rename"

// For production
"conflictResolution": "error"
```

## Advanced Features

### Custom Namespace Strategies

Implement custom namespace logic by extending the `NamespaceManager` class.

### Connection Pooling

Configure connection limits:

```json
"connectionPool": {
  "maxConnections": 10,
  "idleTimeout": 30000,
  "keepAlive": true
}
```

### Tool Categories

Tools are automatically categorized based on name patterns:
- `time.*` → `time` category
- `math.*` → `math` category
- `file.*` → `file` category
- `db.*` → `database` category

## Migration Guide

### From Basic MCP Proxy

Old configuration:
```javascript
mcpProxy({
  server: {
    id: 'external',
    endpoint: 'http://localhost:8080'
  }
})
```

New configuration:
```json
{
  "proxy": {
    "servers": [
      {
        "id": "external",
        "endpoint": "http://localhost:8080"
      }
    ]
  }
}
```

### Legacy Support

The enhanced proxy maintains backward compatibility with the old plugin API for gradual migration.

## Security Considerations

1. **Authentication**: Always use proper authentication for external servers
2. **Network Security**: Use HTTPS endpoints in production
3. **Tool Filtering**: Only expose necessary tools to reduce attack surface
4. **Rate Limiting**: Configure appropriate timeouts and connection limits
5. **Environment Variables**: Never commit secrets to configuration files

## Performance Tips

1. **Health Check Intervals**: Don't set intervals too low for external servers
2. **Connection Pooling**: Use appropriate pool sizes for your workload
3. **Tool Filtering**: Filter out unused tools to reduce overhead
4. **Timeouts**: Set reasonable timeouts based on external server performance

## Support and Contributing

For issues, questions, or contributions:
- **Documentation**: [docs/](./docs/)
- **Examples**: [examples/](./examples/)
- **Issues**: Create GitHub issues for bugs or feature requests
- **Development**: See [CONTRIBUTING.md](./CONTRIBUTING.md)