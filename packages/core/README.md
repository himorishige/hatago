# @hatago/core

Runtime-agnostic MCP (Model Context Protocol) server framework with plugin architecture.

## Overview

Hatago Core provides a minimal, extensible foundation for building MCP servers that run across multiple JavaScript runtimes including Node.js, Cloudflare Workers, Deno, and Bun. It features a plugin-based architecture that keeps the core lightweight while enabling powerful functionality through composable plugins.

## Features

- **🌐 Runtime Agnostic**: Works on Node.js, Cloudflare Workers, Deno, and Bun
- **🔌 Plugin Architecture**: Extensible via plugins, keep core minimal
- **📡 Dual Transport**: Supports both stdio and HTTP transports
- **🛡️ Security First**: Built-in OAuth 2.1, input validation, and security plugins
- **📊 Observability**: Structured logging, metrics, and tracing support
- **🚀 Performance**: Optimized for fast startup and low memory usage

## Installation

```bash
npm install @hatago/core
```

## Quick Start

```typescript
import { createApp, defaultPlugins } from '@hatago/core'

// Create a basic MCP server
const { app, server, ctx } = await createApp({
  name: 'my-mcp-server',
  version: '1.0.0',
  plugins: defaultPlugins.createDefaultPlugins(),
})

// In HTTP mode, app will be available for HTTP requests
if (app) {
  console.log('HTTP server ready')
}

// In stdio mode, server is ready for MCP communication
console.log('MCP server ready')
```

## Core Concepts

### Plugin Architecture

Hatago uses a plugin-based architecture where all functionality is added through plugins:

```typescript
import type { HatagoPlugin } from '@hatago/core'

const myPlugin: HatagoPlugin = ctx => {
  // Add MCP tools
  ctx.server.registerTool(
    'my_tool',
    {
      title: 'My Tool',
      description: 'Example tool',
    },
    async () => {
      return { content: [{ type: 'text', text: 'Hello from my tool!' }] }
    }
  )

  // Add HTTP routes (when app is available)
  if (ctx.app) {
    ctx.app.get('/custom', c => c.json({ message: 'Custom endpoint' }))
  }
}

const { app, server } = await createApp({
  plugins: [myPlugin],
})
```

### Transport Modes

Hatago supports two transport modes:

**stdio Mode** (for direct MCP client integration):

```typescript
const { server } = await createApp({
  mode: 'stdio', // app will be null
})
```

**HTTP Mode** (for web-based integration):

```typescript
const { app, server } = await createApp({
  mode: 'http', // app available for HTTP requests
})
```

## Built-in Plugins

### Default Plugins

- **Health Endpoints**: `/health/live`, `/health/ready`
- **Hello Hatago**: Demo tool with progress notifications
- **Structured Logging**: Request/response logging with PII masking
- **Plugin Security**: Plugin verification and signing
- **Metrics**: Performance and usage metrics

### Security Plugins

- **OAuth Metadata**: RFC 9728 OAuth Protected Resource Metadata
- **Plugin Verifier**: Cryptographic plugin signature verification
- **Input Validation**: Request validation and sanitization

### Observability Plugins

- **SLO Metrics**: Service Level Objective monitoring
- **Correlation ID**: Request tracing across services

## Configuration

```typescript
export interface CreateAppOptions {
  /** Application name */
  name?: string
  /** Application version */
  version?: string
  /** Transport mode: 'stdio' | 'http' */
  mode?: HatagoMode
  /** Environment variables */
  env?: Record<string, unknown>
  /** Custom plugins */
  plugins?: HatagoPlugin[]
}
```

## Environment Variables

### Core Configuration

- `HATAGO_TRANSPORT`: Transport mode (`stdio` | `http`) - default: `http`
- `NODE_ENV`: Environment (`development` | `production`)

### Logging Configuration

- `LOG_LEVEL`: Log level (`trace` | `debug` | `info` | `warn` | `error` | `fatal`) - default: `info`
- `LOG_FORMAT`: Log format (`json` | `pretty`) - default: `pretty`
- `NOREN_MASKING`: Enable PII masking (`true` | `false`) - default: `true`

### Security Configuration

- `REQUIRE_AUTH`: Enforce OAuth authentication (`true` | `false`) - default: `false`
- `AUTH_ISSUER`: OAuth issuer URL
- `RESOURCE`: Resource identifier for OAuth validation

## Plugin Development

### Creating a Plugin

```typescript
import type { HatagoPlugin } from '@hatago/core'

export const myPlugin = (): HatagoPlugin => {
  return ctx => {
    const { server, app, env } = ctx

    // Register MCP tool
    server.registerTool(
      'example_tool',
      {
        title: 'Example Tool',
        description: 'An example MCP tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
      async args => {
        return {
          content: [
            {
              type: 'text',
              text: `Received: ${args.message}`,
            },
          ],
        }
      }
    )

    // Add HTTP endpoint (if in HTTP mode)
    if (app) {
      app.get('/plugin/status', c => {
        return c.json({ plugin: 'example', status: 'active' })
      })
    }
  }
}
```

### Plugin Guidelines

1. **Stateless Design**: Plugins should be stateless when possible
2. **Error Handling**: Always include proper error handling
3. **Type Safety**: Use TypeScript for better development experience
4. **Testing**: Include tests for your plugin functionality
5. **Documentation**: Document plugin configuration and usage

## API Reference

### Core Functions

#### `createApp(options?: CreateAppOptions)`

Creates a new Hatago application instance.

**Returns**: `Promise<{ app: Hono | null, server: McpServer, ctx: HatagoContext }>`

- `app`: Hono application instance (null in stdio mode)
- `server`: MCP server instance
- `ctx`: Plugin context for runtime information

#### `setupMCPEndpoint(app: Hono, server: McpServer)`

Configures the standard MCP endpoint (`/mcp`) for HTTP transport. This utility function is used internally by adapters to provide consistent MCP endpoint behavior.

```typescript
import { setupMCPEndpoint } from '@hatago/core'

// Used internally by adapters
setupMCPEndpoint(app, server)
```

#### `convertNodeEnv(env?: NodeJS.ProcessEnv)`

Converts Node.js environment variables to a generic record format. This utility normalizes environment variable handling across different runtimes.

```typescript
import { convertNodeEnv } from '@hatago/core'

const env = convertNodeEnv(process.env)
```

#### `defaultPlugins.createDefaultPlugins(env?)`

Creates the default plugin set for Hatago.

### Types

#### `HatagoPlugin`

```typescript
type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>
```

#### `HatagoContext`

```typescript
interface HatagoContext {
  app: Hono | null // HTTP app (null in stdio mode)
  server: McpServer // MCP server instance
  env?: Record<string, unknown> // Environment variables
  getBaseUrl: (req: Request) => URL // Base URL helper
  mode?: HatagoMode // Transport mode
}
```

#### `HatagoMode`

```typescript
type HatagoMode = 'stdio' | 'http'
```

## Examples

### Basic MCP Server

```typescript
import { createApp } from '@hatago/core'

const { server } = await createApp({
  name: 'basic-server',
  mode: 'stdio',
})

// Server is ready for MCP communication
```

### HTTP Server with Custom Plugin

```typescript
import { createApp, defaultPlugins } from '@hatago/core'

const customPlugin = ctx => {
  ctx.server.registerTool(
    'echo',
    {
      title: 'Echo',
      description: 'Echo back the input',
    },
    async args => ({
      content: [{ type: 'text', text: `Echo: ${JSON.stringify(args)}` }],
    })
  )
}

const { app, server } = await createApp({
  name: 'custom-server',
  mode: 'http',
  plugins: [...defaultPlugins.createDefaultPlugins(), customPlugin],
})

// Use with adapter for your runtime
```

## Security Considerations

- Always validate plugin inputs using the provided schema validation
- Use environment variables for sensitive configuration
- Enable OAuth authentication in production environments
- Monitor logs for security events and anomalies
- Keep dependencies updated to latest secure versions

## License

MIT

## Contributing

Contributions are welcome! Please see our contributing guidelines and code of conduct.

## Related Packages

- [@hatago/adapter-node](../adapter-node) - Node.js runtime adapter
- [@hatago/adapter-workers](../adapter-workers) - Cloudflare Workers adapter
- [@hatago/cli](../cli) - Command line interface
- [@hatago/config](../config) - Configuration management

## Support

- [GitHub Issues](https://github.com/himorishige/hatago/issues)
- [Documentation](https://github.com/himorishige/hatago/tree/main/docs)
- [Examples](https://github.com/himorishige/hatago/tree/main/examples)
