import { StreamableHTTPTransport } from '@hono/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { defaultPlugins } from './plugins/index.js'
import { applyPlugins } from './system/plugins.js'
import type { HatagoContext } from './system/types.js'

export async function createApp(env?: Record<string, unknown>) {
  const app = new Hono()

  // base util
  const getBaseUrl = (req: Request) => {
    const url = new URL(req.url)
    return new URL(url.origin)
  }

  // health
  app.get('/health', c => c.json({ ok: true, name: 'hatago', version: '0.1.0' }))

  // create MCP server (capabilities auto-inferred by the SDK from registrations)
  const server = new McpServer({ name: 'hatago', version: '0.1.0' })

  const ctx: HatagoContext = { app, server, env, getBaseUrl }

  // apply builtin plugins; users can replace with their own loader later
  // keeps core tiny and deterministic
  await applyPlugins(defaultPlugins, ctx)

  // mount MCP endpoint using @hono/mcp
  app.all('/mcp', async c => {
    const transport = new StreamableHTTPTransport()
    await server.connect(transport)
    return transport.handleRequest(c)
  })

  // optional landing
  app.get('/', c =>
    c.html(`<!doctype html>
  <meta charset="utf-8"/>
  <title>Hatago</title>
  <h1>Hatago MCP</h1>
  <p>remote MCP endpoint is <code>POST /mcp</code>. health at <code>/health</code>.</p>`)
  )

  return { app, server }
}
