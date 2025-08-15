import { type CreateAppOptions, createApp as createCoreApp, defaultPlugins } from '@hatago/core'
import type { HatagoPlugin } from '@hatago/core'
import { StreamableHTTPTransport } from '@hono/mcp'

export interface CreateWorkersAppOptions extends Omit<CreateAppOptions, 'env'> {
  /** Cloudflare Workers environment variables */
  env?: Record<string, unknown>
}

/**
 * Create Hatago application for Cloudflare Workers runtime
 * This adapter bridges Workers-specific APIs to the core
 */
export async function createApp(options: CreateWorkersAppOptions = {}) {
  const { plugins, ...coreOptions } = options

  // Use default plugins if none specified
  const finalPlugins = plugins ?? defaultPlugins.createDefaultPlugins(options.env)

  // Create core app
  const { app, server, ctx } = await createCoreApp({
    ...coreOptions,
    env: options.env ?? {},
    plugins: finalPlugins,
  })

  // Add MCP endpoint with @hono/mcp
  app.all('/mcp', async c => {
    const transport = new StreamableHTTPTransport()
    await server.connect(transport as any) // Type assertion for optional sessionId compatibility
    return transport.handleRequest(c)
  })

  return { app, server, ctx }
}
