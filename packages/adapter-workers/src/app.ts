import { type CreateAppOptions, createApp as createCoreApp, helloHatago } from '@hatago/core'
import type { HatagoPlugin } from '@hatago/core'
import { StreamableHTTPTransport, type Transport } from '@hatago/core/transport'

export interface CreateWorkersAppOptions extends Omit<CreateAppOptions, 'env'> {
  /** Cloudflare Workers environment variables */
  env?: Record<string, unknown>
}

/**
 * Create default plugins for Workers runtime
 */
const createDefaultPlugins = (env?: Record<string, unknown>): HatagoPlugin[] => {
  // Workers runtime has specific capabilities and constraints
  return [helloHatago]
}

/**
 * Configure MCP endpoint for Workers runtime
 */
const configureMCPEndpoint = (app: NonNullable<Awaited<ReturnType<typeof createCoreApp>>['app']>, server: Awaited<ReturnType<typeof createCoreApp>>['server']) => {
  app.all('/mcp', async c => {
    const transport = new StreamableHTTPTransport()
    // Initialize sessionId to satisfy Transport interface requirement
    transport.sessionId = transport.sessionId ?? ''
    await server.connect(transport as Transport)
    return transport.handleRequest(c)
  })
}

/**
 * Create Hatago application for Cloudflare Workers runtime
 * Pure function that bridges Workers-specific APIs to the core
 */
export async function createApp(options: CreateWorkersAppOptions = {}) {
  const { plugins, ...coreOptions } = options

  // Use default plugins if none specified - pure function
  const finalPlugins = plugins ?? createDefaultPlugins(options.env)

  // Create core app - side effect contained
  const { app, server, ctx } = await createCoreApp({
    ...coreOptions,
    env: options.env ?? {},
    plugins: finalPlugins,
  })

  // Configure MCP endpoint if HTTP mode - side effect contained
  if (app) {
    configureMCPEndpoint(app, server)
  }

  return { app, server, ctx }
}
