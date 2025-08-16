import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { applyPlugins } from './plugins.js'
import { correlationId } from './middleware/correlation-id.js'
import type { HatagoContext, HatagoPlugin, HatagoMode } from './types.js'

export interface CreateAppOptions {
  /** Environment variables (runtime-specific) */
  env?: Record<string, unknown>

  /** Custom plugins to apply */
  plugins?: HatagoPlugin[]

  /** App name and version */
  name?: string
  version?: string

  /** Transport mode */
  mode?: HatagoMode
}

/**
 * Create Hatago application with MCP server
 * This factory is runtime-agnostic and only uses Web Standard APIs
 */
export async function createApp(options: CreateAppOptions = {}) {
  const { env, plugins = [], name = 'hatago', version = '0.1.0', mode = 'http' } = options

  const app = mode === 'http' ? new Hono() : null

  // Add correlation ID middleware (only in HTTP mode)
  if (app) {
    app.use('*', correlationId())
  }

  // Base utility functions
  const getBaseUrl = (req: Request) => {
    const url = new URL(req.url)
    return new URL(url.origin)
  }

  // Health check endpoint (only in HTTP mode)
  if (app) {
    app.get('/health', c =>
      c.json({ ok: true, name, version, timestamp: new Date().toISOString() })
    )
  }

  // Create MCP server (capabilities auto-inferred by the SDK from registrations)
  const server = new McpServer({ name, version })

  // Create context for plugins
  const ctx: HatagoContext = { app, server, env: env ?? {}, getBaseUrl, mode }

  // Apply plugins
  await applyPlugins(plugins, ctx)

  // Basic landing page (only in HTTP mode)
  if (app) {
    app.get('/', c =>
      c.html(`<!doctype html>
<meta charset="utf-8"/>
<title>${name}</title>
<h1>${name} v${version}</h1>
<p>Remote MCP endpoint: <code>POST /mcp</code></p>
<p>Health check: <code>GET /health</code></p>
<p>Powered by Hono + @hono/mcp</p>`)
    )
  }

  return { app, server, ctx }
}
