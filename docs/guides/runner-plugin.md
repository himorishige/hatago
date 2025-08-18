# Runner Plugin Guide

The Runner Plugin enables Hatago to manage external MCP servers as subprocesses, providing a unified interface for controlling multiple MCP servers through package managers like npx, pnpm, yarn, bun, and deno.

## Overview

The Runner Plugin allows you to:

- Start and stop MCP servers dynamically
- Manage multiple servers simultaneously
- Apply security sandboxing and resource limits
- Auto-restart failed servers
- Monitor server health
- Configure servers through various formats (JSON, YAML, TOML, JS/TS)

## Basic Configuration

### Minimal Setup

```yaml
# .hatagorc.yaml
runner:
  servers:
    - id: my-server
      name: My MCP Server
      package: '@example/mcp-server'
      packageManager: npx
      transport:
        type: stdio
      autoStart: true
```

### Complete Example

```yaml
runner:
  servers:
    - id: sqlite-db
      name: SQLite Database Server
      package: '@modelcontextprotocol/server-sqlite'
      packageManager: npx
      args:
        - '--db'
        - './data/app.db'
      env:
        LOG_LEVEL: 'debug'
      transport:
        type: stdio
      autoStart: true
      restartOnFailure: true
      maxRestarts: 3
      permissions:
        network: false
        fsRead: true
        fsWrite: true
        env: false
        spawn: false
        allowedPaths:
          - './data'
      limits:
        memory: 256 # MB
        timeout: 30 # seconds
```

## Server Manifest Schema

### Required Fields

| Field            | Type   | Description                                                  |
| ---------------- | ------ | ------------------------------------------------------------ |
| `id`             | string | Unique identifier for the server                             |
| `name`           | string | Human-readable name                                          |
| `package`        | string | NPM package name or executable path                          |
| `packageManager` | string | Package manager to use: `npx`, `pnpm`, `yarn`, `bun`, `deno` |
| `transport`      | object | Transport configuration (stdio or http)                      |

### Optional Fields

| Field              | Type     | Default  | Description                           |
| ------------------ | -------- | -------- | ------------------------------------- |
| `version`          | string   | `latest` | Package version to use                |
| `args`             | string[] | `[]`     | Command-line arguments                |
| `env`              | object   | `{}`     | Environment variables                 |
| `cwd`              | string   | `.`      | Working directory                     |
| `autoStart`        | boolean  | `false`  | Start automatically on initialization |
| `restartOnFailure` | boolean  | `false`  | Restart on crash                      |
| `maxRestarts`      | number   | `3`      | Maximum restart attempts              |
| `permissions`      | object   | -        | Security permissions                  |
| `limits`           | object   | -        | Resource limits                       |

## Transport Configuration

### stdio Transport

Most MCP servers use stdio for communication:

```yaml
transport:
  type: stdio
```

### HTTP Transport

Some servers expose HTTP endpoints:

```yaml
transport:
  type: http
  port: 3456
  hostname: localhost
```

## Package Managers

### npx (Default)

```yaml
packageManager: npx
package: '@modelcontextprotocol/server-sqlite'
version: '^1.0.0' # Optional version constraint
```

### pnpm

```yaml
packageManager: pnpm
package: '@modelcontextprotocol/server-filesystem'
```

### yarn

```yaml
packageManager: yarn
package: '@example/custom-server'
```

### bun

```yaml
packageManager: bun
package: '@fast/mcp-server'
```

### deno

```yaml
packageManager: deno
package: 'https://deno.land/x/mcp_server/mod.ts'
```

## Security Features

### Permission System

Control what servers can access:

```yaml
permissions:
  network: false # Network access
  fsRead: true # File system read
  fsWrite: false # File system write
  env: false # Environment variables
  spawn: false # Spawn subprocesses
  allowedPaths: # Restrict file access
    - './data'
    - './public'
  allowedHosts: # Restrict network access
    - 'api.example.com'
    - 'localhost'
```

### Resource Limits

Prevent resource exhaustion:

```yaml
limits:
  memory: 512 # Memory limit in MB
  cpuTime: 300 # CPU time limit in seconds
  timeout: 60 # Operation timeout in seconds
```

### Platform-Specific Sandboxing

The Runner Plugin applies platform-specific sandboxing:

- **Linux**: Uses firejail or bubblewrap if available
- **macOS**: Uses sandbox-exec with custom profiles
- **Windows**: Limited sandboxing (consider using WSL or containers)

## Auto-Restart and Health Monitoring

### Auto-Restart Configuration

```yaml
restartOnFailure: true
maxRestarts: 5
restartDelay: 1000 # Milliseconds between restarts
```

### Health Check

The Runner Plugin automatically monitors server health by:

1. Checking process status
2. Attempting MCP `tools/list` requests
3. Measuring response latency

## API Usage

### Using MCP Tools

Once a server is running, access its tools through the unified interface:

```typescript
// Access through Hatago's MCP endpoint
const response = await fetch('http://localhost:8787/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'sqlite_query', // Tool from sqlite server
      arguments: {
        query: 'SELECT * FROM users',
      },
    },
  }),
})
```

### Management API

Control servers via HTTP API:

```bash
# Start a server
curl -X POST http://localhost:8787/runner/start \
  -H "Content-Type: application/json" \
  -d '{"serverId": "sqlite-db"}'

# Stop a server
curl -X POST http://localhost:8787/runner/stop \
  -H "Content-Type: application/json" \
  -d '{"serverId": "sqlite-db"}'

# Get server status
curl http://localhost:8787/runner/status/sqlite-db

# List all servers
curl http://localhost:8787/runner/servers
```

## Dynamic Configuration

Use JavaScript/TypeScript for dynamic configuration:

```javascript
// .hatagorc.js
module.exports = {
  runner: {
    servers: [
      {
        id: 'db-server',
        package:
          process.env.DB_TYPE === 'postgres'
            ? '@modelcontextprotocol/server-postgres'
            : '@modelcontextprotocol/server-sqlite',
        env: {
          DATABASE_URL: process.env.DATABASE_URL,
        },
        autoStart: process.env.NODE_ENV === 'production',
      },
    ],
  },
}
```

## Best Practices

### 1. Use Minimal Permissions

Only grant necessary permissions:

```yaml
permissions:
  network: false # Don't enable unless needed
  fsWrite: false # Prefer read-only access
  spawn: false # Avoid subprocess spawning
```

### 2. Set Resource Limits

Always set appropriate limits:

```yaml
limits:
  memory: 256 # Start conservative
  timeout: 30 # Reasonable timeout
```

### 3. Handle Failures Gracefully

Configure restart behavior:

```yaml
restartOnFailure: true
maxRestarts: 3
restartDelay: 2000
```

### 4. Use Environment Variables

Keep sensitive data out of config:

```yaml
env:
  API_KEY: ${EXTERNAL_API_KEY} # Read from environment
  DATABASE_URL: ${DATABASE_URL}
```

### 5. Monitor Server Health

Enable health checks for critical servers:

```yaml
healthCheck:
  interval: 30000
  timeout: 5000
  retries: 3
```

## Troubleshooting

### Server Won't Start

1. Check package name is correct
2. Verify package manager is installed
3. Check network connectivity for package download
4. Review permissions and limits
5. Check logs: `LOG_LEVEL=debug pnpm dev`

### Server Crashes Repeatedly

1. Check `maxRestarts` limit
2. Review server logs for errors
3. Verify resource limits are adequate
4. Check for permission violations

### Connection Issues

1. Verify transport configuration
2. Check port availability for HTTP transport
3. Ensure stdio pipes are properly configured
4. Check firewall settings

### Performance Issues

1. Adjust memory limits
2. Review CPU usage
3. Check for resource leaks
4. Monitor restart frequency

## Examples

See the [`examples/runner-examples/`](../../examples/runner-examples/) directory for complete examples:

- `basic-sqlite.yaml` - Simple SQLite server setup
- `dev-toolchain.yaml` - Development environment with multiple servers
- `web-analysis.js` - Dynamic configuration with Playwright
- `restricted-sandbox.yaml` - Security-focused configuration
- `high-availability.yaml` - Production setup with auto-restart

## Related Documentation

- [Configuration Guide](./configuration.md) - Complete configuration system documentation
- [Plugin Development](./plugin-development.md) - Create custom plugins
- [MCP Protocol](../mcp/README.md) - Model Context Protocol details
