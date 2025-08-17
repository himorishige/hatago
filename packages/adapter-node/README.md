# @hatago/adapter-node

Node.js runtime adapter for Hatago MCP framework.

## Overview

The Node.js adapter bridges Hatago Core with Node.js runtime, providing both HTTP server and stdio transport capabilities. It's the primary way to run Hatago MCP servers in Node.js environments, including development, production servers, and CLI applications.

## Features

- **🚀 HTTP Server**: Built-in HTTP server using @hono/node-server
- **📡 stdio Transport**: Direct MCP client integration via stdio
- **🔧 Development Ready**: Hot reload and development tooling
- **📦 Production Ready**: Optimized builds and monitoring
- **🌍 Environment Variables**: Full Node.js env integration

## Installation

```bash
npm install @hatago/adapter-node @hatago/core
```

## Quick Start

### HTTP Server

```typescript
import { createApp } from '@hatago/adapter-node'
import { serve } from '@hono/node-server'

const { app } = await createApp({
  name: 'my-hatago-server',
  version: '1.0.0',
})

if (app) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 8787
  serve({ fetch: app.fetch, port })
  console.log(`Server running on http://localhost:${port}`)
}
```

### stdio Server (for Claude Desktop integration)

```typescript
import { createApp } from '@hatago/adapter-node'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const { server } = await createApp({
  name: 'my-hatago-server',
  mode: 'stdio',
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

## CLI Usage

The adapter includes a binary for quick server startup:

```bash
# Start HTTP server
npx hatago-node

# Start stdio server
npx hatago-node --stdio

# With custom port
PORT=3000 npx hatago-node
```

## Development Setup

### Project Structure

```
my-hatago-server/
├── package.json
├── src/
│   ├── server.ts      # HTTP server entry
│   ├── stdio.ts       # stdio server entry
│   └── plugins/       # Custom plugins
├── tsconfig.json
└── hatago.config.json # Optional configuration
```

### package.json

```json
{
  "name": "my-hatago-server",
  "type": "module",
  "scripts": {
    "dev": "tsx src/server.ts",
    "dev:stdio": "tsx src/stdio.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "start:stdio": "node dist/stdio.js"
  },
  "dependencies": {
    "@hatago/adapter-node": "^0.1.0",
    "@hatago/core": "^0.1.0"
  },
  "devDependencies": {
    "tsx": "^4.20.4",
    "typescript": "^5.9.2"
  }
}
```

### HTTP Server (src/server.ts)

```typescript
import { createApp } from '@hatago/adapter-node'
import { serve } from '@hono/node-server'

async function main() {
  const { app } = await createApp({
    name: 'my-server',
    version: '1.0.0',
    env: process.env,
    mode: 'http',
  })

  if (!app) {
    console.error('Failed to create HTTP app')
    process.exit(1)
  }

  const port = process.env.PORT ? parseInt(process.env.PORT) : 8787

  serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0',
  })

  console.log(`🚀 Hatago server running on http://localhost:${port}`)
  console.log(`   Health: http://localhost:${port}/health`)
  console.log(`   MCP:    http://localhost:${port}/mcp`)
}

main().catch(console.error)
```

### stdio Server (src/stdio.ts)

```typescript
import { createApp } from '@hatago/adapter-node'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

async function serveStdio() {
  const { server } = await createApp({
    name: 'my-server',
    version: '1.0.0',
    env: process.env,
    mode: 'stdio',
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

serveStdio().catch(console.error)
```

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=8787                    # HTTP server port
HOST=localhost               # HTTP server host

# Transport Mode
HATAGO_TRANSPORT=http        # 'http' | 'stdio'

# Logging
LOG_LEVEL=info              # trace|debug|info|warn|error|fatal
LOG_FORMAT=pretty           # json|pretty
NOREN_MASKING=true          # Enable PII masking

# Security
REQUIRE_AUTH=false          # Enable OAuth authentication
AUTH_ISSUER=                # OAuth issuer URL
RESOURCE=                   # Resource identifier

# Development
NODE_ENV=development        # development|production
```

### Using with Custom Plugins

```typescript
import { createApp } from '@hatago/adapter-node'
import type { HatagoPlugin } from '@hatago/core'

// Custom plugin
const myPlugin: HatagoPlugin = ctx => {
  ctx.server.registerTool(
    'node_info',
    {
      title: 'Node.js Info',
      description: 'Get Node.js runtime information',
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: `Node.js ${process.version} on ${process.platform}`,
        },
      ],
    })
  )
}

const { app, server } = await createApp({
  plugins: [myPlugin],
})
```

## Claude Desktop Integration

To use with Claude Desktop, add to your `claude_desktop_config.json`:

### With Pre-built Binary

```json
{
  "mcpServers": {
    "my-hatago-server": {
      "command": "npx",
      "args": ["hatago-node", "--stdio"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### With Custom Server

```json
{
  "mcpServers": {
    "my-hatago-server": {
      "command": "node",
      "args": ["dist/stdio.js"],
      "cwd": "/path/to/your/server",
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

## Testing

### Manual Testing

```bash
# Test HTTP endpoint
curl http://localhost:8787/health

# Test MCP initialization
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }'
```

### Unit Testing

```typescript
import { createApp } from '@hatago/adapter-node'
import { describe, it, expect } from 'vitest'

describe('Hatago Node.js Adapter', () => {
  it('should create HTTP app', async () => {
    const { app, server } = await createApp({
      mode: 'http',
    })

    expect(app).toBeDefined()
    expect(server).toBeDefined()
  })

  it('should create stdio server', async () => {
    const { app, server } = await createApp({
      mode: 'stdio',
    })

    expect(app).toBeNull()
    expect(server).toBeDefined()
  })
})
```

## Production Deployment

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY hatago.config.json ./

EXPOSE 8787
CMD ["node", "dist/server.js"]
```

### PM2

```json
{
  "apps": [
    {
      "name": "hatago-server",
      "script": "dist/server.js",
      "instances": "max",
      "exec_mode": "cluster",
      "env": {
        "NODE_ENV": "production",
        "PORT": 8787,
        "LOG_FORMAT": "json",
        "LOG_LEVEL": "info"
      }
    }
  ]
}
```

### systemd Service

```ini
[Unit]
Description=Hatago MCP Server
After=network.target

[Service]
Type=simple
User=hatago
WorkingDirectory=/opt/hatago
ExecStart=/usr/bin/node dist/server.js
Environment=NODE_ENV=production
Environment=PORT=8787
Environment=LOG_FORMAT=json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Monitoring

### Health Checks

```bash
# Liveness probe
curl http://localhost:8787/health/live

# Readiness probe
curl http://localhost:8787/health/ready

# Detailed health
curl http://localhost:8787/health
```

### Logs

```bash
# In production with JSON logging
tail -f logs/hatago.log | jq .

# Filter by level
tail -f logs/hatago.log | jq 'select(.level >= 30)'
```

## Troubleshooting

### Common Issues

**Server won't start**

```bash
# Check port availability
lsof -i :8787

# Check logs
DEBUG=* npm run dev
```

**stdio mode not working**

```bash
# Test stdio directly
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/stdio.js
```

**Memory issues**

```bash
# Increase Node.js heap size
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Enable MCP SDK debug
DEBUG=mcp:* npm run dev
```

## API Reference

### `createApp(options?: CreateNodeAppOptions)`

Creates a new Hatago application for Node.js.

```typescript
interface CreateNodeAppOptions extends Omit<CreateAppOptions, 'env'> {
  /** Node.js environment variables */
  env?: NodeJS.ProcessEnv
}
```

## Examples

See the [examples directory](../../examples) for complete working examples:

- Basic HTTP server
- stdio server for Claude Desktop
- Custom plugins
- Production deployment

## License

MIT

## Related Packages

- [@hatago/core](../core) - Core framework
- [@hatago/adapter-workers](../adapter-workers) - Cloudflare Workers adapter
- [@hatago/cli](../cli) - Command line tools
