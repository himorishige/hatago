import { type CreateAppOptions, createApp as createCoreApp, defaultPlugins } from '@hatago/core'
import type { HatagoPlugin } from '@hatago/core'
import { StreamableHTTPTransport } from '@hatago/core/transport'

export interface CreateNodeAppOptions extends Omit<CreateAppOptions, 'env'> {
  /** Node.js environment variables */
  env?: NodeJS.ProcessEnv
}

/**
 * Create Hatago application for Node.js runtime
 * This adapter bridges Node.js specific APIs to the core
 */
export async function createApp(options: CreateNodeAppOptions = {}) {
  const { plugins, ...coreOptions } = options

  // Convert Node.js env to generic record
  const env = options.env
    ? (Object.fromEntries(Object.entries(options.env).filter(([, v]) => v !== undefined)) as Record<
        string,
        unknown
      >)
    : {}

  // Use default plugins if none specified
  const finalPlugins = plugins ?? defaultPlugins.createDefaultPlugins(env)

  // Create core app
  const { app, server, ctx } = await createCoreApp({
    ...coreOptions,
    env,
    plugins: finalPlugins,
  })

  // Add MCP endpoint with @hono/mcp (only in HTTP mode)
  if (app) {
    app.all('/mcp', async c => {
      const transport = new StreamableHTTPTransport()
      await server.connect(transport as any) // Temporary fix for sessionId type mismatch
      return transport.handleRequest(c)
    })
  }

  return { app, server, ctx }
}
