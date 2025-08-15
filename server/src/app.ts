import { StreamableHTTPTransport } from '@hono/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { defaultPlugins } from './plugins/index.js'
import { applyPlugins } from './system/plugins.js'
import type { HatagoContext } from './system/types.js'

/**
 * Create Hatago Hono app and MCP server.
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

/**
 * Create Hatago app and MCP server.
 * @param env - Optional environment variables.
 * @returns { app, server }
 */
export async function createApp(env?: Record<string, unknown>) {
  const app = new Hono()

  // base util
  const getBaseUrl = (req: Request) => {
    const url = new URL(req.url)
    return new URL(url.origin)
  }

  // health
  app.get(ROUTE_HEALTH, c => c.json({ ok: true, name: APP_NAME, version: APP_VERSION }))

  // create MCP server (capabilities auto-inferred by the SDK from registrations)
  const server = new McpServer({ name: APP_NAME, version: APP_VERSION })

  const ctx: HatagoContext = { app, server, env, getBaseUrl }

  // apply builtin plugins; users can replace with their own loader later
  // keeps core tiny and deterministic
  await applyPlugins(defaultPlugins, ctx)

  // mount MCP endpoint using @hono/mcp
  app.all(ROUTE_MCP, async c => {
    const transport = new StreamableHTTPTransport()
    await server.connect(transport)
    return transport.handleRequest(c)
  })

  // optional landing
  app.get(ROUTE_ROOT, c => c.html(LANDING_HTML))

  return { app, server }
}
