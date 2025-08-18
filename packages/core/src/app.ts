import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { setupMCPEndpoint } from './mcp-setup.js'
import { correlationId } from './middleware/correlation-id.js'
import { mcpSecurityHeaders } from './middleware/security-headers.js'
import { applyPlugins } from './plugins.js'
import type { HatagoContext, HatagoMode, HatagoPlugin } from './types.js'
import type { RuntimeAdapter } from './types/runtime.js'
import { defaultRuntimeAdapter } from './types/runtime.js'

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

  /** Runtime adapter for environment and I/O operations */
  runtimeAdapter?: RuntimeAdapter
}

/**
 * Create Hatago application with MCP server
 * This factory is runtime-agnostic and only uses Web Standard APIs
 */
export async function createApp(options: CreateAppOptions = {}) {
  const {
    env,
    plugins = [],
    name = 'hatago',
    version = '0.1.0',
    mode = 'http',
    runtimeAdapter = defaultRuntimeAdapter,
  } = options

  const app = mode === 'http' ? new Hono() : null

  // Add security and correlation ID middleware (only in HTTP mode)
  if (app) {
    app.use('*', mcpSecurityHeaders())
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
  const ctx: HatagoContext = {
    app,
    server,
    env: env ?? {},
    getBaseUrl,
    mode,
    runtimeAdapter,
    // sessionContext will be injected by mcp-setup when available
  }

  // Apply plugins
  await applyPlugins(plugins, ctx)

  // Setup MCP endpoint for HTTP mode
  if (app && mode === 'http') {
    setupMCPEndpoint(app, server)
  }

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
