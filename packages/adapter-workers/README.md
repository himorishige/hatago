# @hatago/adapter-workers

Cloudflare Workers runtime adapter for Hatago MCP framework.

## Overview

The Cloudflare Workers adapter enables Hatago MCP servers to run on Cloudflare's edge computing platform. It provides HTTP-only transport (stdio is not supported in Workers) and integrates with Workers-specific APIs like KV, Durable Objects, and environment variables.

## Features

- **⚡ Edge Computing**: Run MCP servers on Cloudflare's global edge network
- **🌐 HTTP Only**: Optimized HTTP transport for web-based MCP clients
- **🔧 Workers APIs**: Integration with KV, Durable Objects, and environment variables
- **📦 Zero Cold Start**: Minimal runtime overhead for instant scaling
- **🛡️ Built-in Security**: Cloudflare's security and DDoS protection

## Installation

```bash
npm install @hatago/adapter-workers @hatago/core
```

## Quick Start

### Basic Worker

```typescript
// src/worker.ts
import { createApp } from '@hatago/adapter-workers'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const { app } = await createApp({
      name: 'my-hatago-worker',
      version: '1.0.0',
      env: env as Record<string, unknown>,
    })

    if (!app) {
      return new Response('Server initialization failed', { status: 500 })
    }

    return app.fetch(request, env, ctx)
  },
}
```

### With TypeScript

```typescript
// src/worker.ts
interface Env {
  // Environment variables
  LOG_LEVEL?: string
  REQUIRE_AUTH?: string

  // Cloudflare bindings
  MY_KV: KVNamespace
  MY_DO: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const { app } = await createApp({
      name: 'my-hatago-worker',
      version: '1.0.0',
      env: env as Record<string, unknown>,
    })

    return app?.fetch(request, env, ctx) ?? new Response('Server error', { status: 500 })
  },
}
```

## Development Setup

### Project Structure

```
my-hatago-worker/
├── package.json
├── wrangler.toml
├── src/
│   ├── worker.ts      # Main worker entry
│   └── plugins/       # Custom plugins
└── dist/              # Built files
```

### wrangler.toml

```toml
name = "my-hatago-worker"
main = "dist/worker.js"
compatibility_date = "2024-01-01"

[env.development]
name = "my-hatago-worker-dev"

[env.production]
name = "my-hatago-worker-prod"

# Environment variables
[vars]
LOG_LEVEL = "info"
LOG_FORMAT = "json"
REQUIRE_AUTH = "false"

# Secrets (use wrangler secret put)
# AUTH_ISSUER = "..."
# RESOURCE = "..."

# KV bindings
[[kv_namespaces]]
binding = "MY_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-id"

# Durable Objects
[[durable_objects.bindings]]
name = "MY_DO"
class_name = "MyDurableObject"
```

### package.json

```json
{
  "name": "my-hatago-worker",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run",
    "deploy": "wrangler deploy",
    "deploy:staging": "wrangler deploy --env development",
    "deploy:prod": "wrangler deploy --env production"
  },
  "dependencies": {
    "@hatago/adapter-workers": "^0.1.0",
    "@hatago/core": "^0.1.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241224.0",
    "wrangler": "^3.114.13",
    "typescript": "^5.9.2"
  }
}
```

## Custom Plugins for Workers

### Using KV Storage

```typescript
import type { HatagoPlugin } from '@hatago/core'

interface WorkerEnv {
  MY_KV: KVNamespace
}

export const kvPlugin = (): HatagoPlugin => {
  return ctx => {
    const env = ctx.env as WorkerEnv

    ctx.server.registerTool(
      'kv_get',
      {
        title: 'Get KV Value',
        description: 'Get value from Cloudflare KV',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
          },
          required: ['key'],
        },
      },
      async args => {
        const value = await env.MY_KV.get(args.key)
        return {
          content: [
            {
              type: 'text',
              text: value ? `Value: ${value}` : 'Key not found',
            },
          ],
        }
      }
    )

    ctx.server.registerTool(
      'kv_set',
      {
        title: 'Set KV Value',
        description: 'Set value in Cloudflare KV',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['key', 'value'],
        },
      },
      async args => {
        await env.MY_KV.put(args.key, args.value)
        return {
          content: [
            {
              type: 'text',
              text: `Set ${args.key} = ${args.value}`,
            },
          ],
        }
      }
    )
  }
}
```

### Using Durable Objects

```typescript
export const durableObjectPlugin = (): HatagoPlugin => {
  return ctx => {
    const env = ctx.env as WorkerEnv

    ctx.server.registerTool(
      'do_call',
      {
        title: 'Call Durable Object',
        description: 'Call method on Durable Object',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            method: { type: 'string' },
            data: { type: 'object' },
          },
          required: ['id', 'method'],
        },
      },
      async args => {
        const id = env.MY_DO.idFromName(args.id)
        const stub = env.MY_DO.get(id)

        const response = await stub.fetch('/', {
          method: 'POST',
          body: JSON.stringify({
            method: args.method,
            data: args.data,
          }),
        })

        const result = await response.text()
        return {
          content: [
            {
              type: 'text',
              text: `DO Response: ${result}`,
            },
          ],
        }
      }
    )
  }
}
```

## Environment Configuration

### Environment Variables

```bash
# Logging
LOG_LEVEL=info              # trace|debug|info|warn|error|fatal
LOG_FORMAT=json             # json|pretty (use json in production)
NOREN_MASKING=true          # Enable PII masking

# Security
REQUIRE_AUTH=false          # Enable OAuth authentication
AUTH_ISSUER=                # OAuth issuer URL
RESOURCE=                   # Resource identifier

# Workers specific
CF_ZONE_ID=                 # Cloudflare zone ID
CF_ACCOUNT_ID=              # Cloudflare account ID
```

### Secrets Management

```bash
# Set secrets using wrangler
wrangler secret put AUTH_ISSUER
wrangler secret put DATABASE_URL
wrangler secret put API_KEY
```

## Testing

### Local Development

```bash
# Start development server
npm run dev

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
import { createApp } from '@hatago/adapter-workers'
import { describe, it, expect } from 'vitest'

describe('Hatago Workers Adapter', () => {
  it('should create app', async () => {
    const { app, server } = await createApp()

    expect(app).toBeDefined()
    expect(server).toBeDefined()
  })

  it('should handle requests', async () => {
    const { app } = await createApp()

    const response = await app!.fetch(new Request('http://localhost/health'))

    expect(response.status).toBe(200)
  })
})
```

## Deployment

### Staging Deployment

```bash
# Deploy to staging
npm run deploy:staging

# View logs
wrangler tail --env development
```

### Production Deployment

```bash
# Deploy to production
npm run deploy:prod

# View logs
wrangler tail --env production

# View analytics
wrangler analytics --env production
```

### CI/CD with GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run build

      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy --env production
```

## Monitoring and Observability

### Cloudflare Analytics

```bash
# View worker analytics
wrangler analytics

# Real-time logs
wrangler tail

# Performance metrics
wrangler analytics --metrics
```

### Custom Metrics

```typescript
export const metricsPlugin = (): HatagoPlugin => {
  return ctx => {
    if (ctx.app) {
      ctx.app.use(async (c, next) => {
        const start = Date.now()
        await next()

        // Log metrics (will appear in Cloudflare logs)
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            method: c.req.method,
            path: c.req.path,
            status: c.res.status,
            duration: Date.now() - start,
            cf: c.req.raw.cf, // Cloudflare metadata
          })
        )
      })
    }
  }
}
```

### Health Checks

```typescript
// Custom health check with Workers-specific info
export const workersHealthPlugin = (): HatagoPlugin => {
  return ctx => {
    if (ctx.app) {
      ctx.app.get('/health/workers', c => {
        return c.json({
          ok: true,
          timestamp: new Date().toISOString(),
          worker: {
            colo: c.req.raw.cf?.colo,
            country: c.req.raw.cf?.country,
            ray: c.req.raw.cf?.ray,
          },
        })
      })
    }
  }
}
```

## Performance Optimization

### Bundle Size

```javascript
// wrangler.toml
[build]
command = "npm run build"

# Use tree-shaking friendly imports
import { createApp } from '@hatago/adapter-workers'
# Avoid importing entire packages
import { defaultPlugins } from '@hatago/core/plugins'
```

### Memory Usage

```typescript
// Optimize for Workers memory limits
const { app } = await createApp({
  plugins: [
    // Only include essential plugins
    healthEndpoints(),
    structuredLogging({ bufferSize: 100 }),
  ],
})
```

### Caching

```typescript
export const cachePlugin = (): HatagoPlugin => {
  return ctx => {
    if (ctx.app) {
      ctx.app.use('/api/*', async (c, next) => {
        // Check cache first
        const cache = caches.default
        const cacheKey = new Request(c.req.url, c.req.raw)

        const cached = await cache.match(cacheKey)
        if (cached) {
          return cached
        }

        await next()

        // Cache successful responses
        if (c.res.status === 200) {
          c.res.headers.set('Cache-Control', 'max-age=300')
          await cache.put(cacheKey, c.res.clone())
        }
      })
    }
  }
}
```

## Troubleshooting

### Common Issues

**Worker size limits**

```bash
# Check bundle size
wrangler deploy --dry-run

# Optimize imports
import { createApp } from '@hatago/adapter-workers'
# Instead of
import * as hatago from '@hatago/adapter-workers'
```

**Environment variable issues**

```bash
# List environment variables
wrangler env list

# Check secrets
wrangler secret list
```

**Deployment failures**

```bash
# Verbose deployment
wrangler deploy --verbose

# Check syntax
wrangler validate
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug wrangler dev

# Inspect request/response
wrangler tail --format pretty
```

## Limitations

- **No stdio transport**: Workers only support HTTP transport
- **No file system**: Use KV or external storage for persistence
- **Memory limits**: 128MB memory limit per worker
- **CPU time limits**: 100ms CPU time for free plan, 30s for paid
- **Bundle size**: 10MB compressed bundle size limit

## Examples

### Basic MCP Server

```typescript
import { createApp } from '@hatago/adapter-workers'

export default {
  async fetch(request: Request, env: Record<string, unknown>) {
    const { app } = await createApp({
      name: 'basic-mcp-server',
      env,
    })

    return app?.fetch(request, env) ?? new Response('Error', { status: 500 })
  },
}
```

### With Custom Plugins

```typescript
import { createApp } from '@hatago/adapter-workers'
import { kvPlugin, metricsPlugin } from './plugins'

export default {
  async fetch(request: Request, env: Env) {
    const { app } = await createApp({
      name: 'advanced-mcp-server',
      env: env as Record<string, unknown>,
      plugins: [kvPlugin(), metricsPlugin()],
    })

    return app?.fetch(request, env) ?? new Response('Error', { status: 500 })
  },
}
```

## API Reference

### `createApp(options?: CreateWorkersAppOptions)`

Creates a new Hatago application for Cloudflare Workers.

```typescript
interface CreateWorkersAppOptions extends Omit<CreateAppOptions, 'env'> {
  /** Cloudflare Workers environment variables */
  env?: Record<string, unknown>
}
```

## License

MIT

## Related Packages

- [@hatago/core](../core) - Core framework
- [@hatago/adapter-node](../adapter-node) - Node.js adapter
- [@hatago/cli](../cli) - Command line tools
