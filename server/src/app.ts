import { StreamableHTTPTransport } from '@hono/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { defaultPlugins } from './plugins/index.js'
import { applyPlugins } from './system/plugins.js'
import type { HatagoContext, HatagoMode } from './system/types.js'

/**
 * Create Hatago MCP server with optional HTTP app.
 * Keeps core tiny; features are provided via plugins.
 */
const APP_NAME = 'hatago'
const APP_VERSION = '0.1.0'

// route constants
const ROUTE_HEALTH = '/health'
const ROUTE_MCP = '/mcp'
const ROUTE_ROOT = '/'

// landing html (kept minimal)
const LANDING_HTML = `<!doctype html>
  <meta charset="utf-8"/>
  <title>Hatago</title>
  <h1>Hatago MCP</h1>
  <p>remote MCP endpoint is <code>POST /mcp</code>. health at <code>/health</code>.</p>`

export interface CreateAppOptions {
  env?: Record<string, unknown>
  mode?: HatagoMode
}

/**
 * Create Hatago app and MCP server.
 * @param options - Configuration options including mode and environment
 * @returns { app, server }
 */
export async function createApp(options: CreateAppOptions = {}) {
  const { env, mode = 'http' } = options
  
  // Create HTTP app only in http mode
  const app = mode === 'http' ? new Hono() : null

  // base util (only available in http mode)
  const getBaseUrl = (req: Request) => {
    if (mode === 'stdio') {
      throw new Error('getBaseUrl is not available in stdio mode')
    }
    const url = new URL(req.url)
    return new URL(url.origin)
  }

  // create MCP server (capabilities auto-inferred by the SDK from registrations)
  const server = new McpServer({ name: APP_NAME, version: APP_VERSION })

  const ctx: HatagoContext = { app, server, env, mode, getBaseUrl }

  // apply builtin plugins; users can replace with their own loader later
  // keeps core tiny and deterministic
  await applyPlugins(defaultPlugins, ctx)

  // HTTP-specific routes (only in http mode)
  if (app && mode === 'http') {
    // health
    app.get(ROUTE_HEALTH, c => c.json({ ok: true, name: APP_NAME, version: APP_VERSION }))

    // mount MCP endpoint using @hono/mcp
    app.all(ROUTE_MCP, async c => {
      const transport = new StreamableHTTPTransport()
      await server.connect(transport)
      return transport.handleRequest(c)
    })

    // optional landing
    app.get(ROUTE_ROOT, c => c.html(LANDING_HTML))
  }

  return { app, server }
}
