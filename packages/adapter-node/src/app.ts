import { type CreateAppOptions, createApp as createCoreApp, helloHatago } from '@hatago/core'
import type { HatagoPlugin } from '@hatago/core'
import { StreamableHTTPTransport, type Transport } from '@hatago/core/transport'

export interface CreateNodeAppOptions extends Omit<CreateAppOptions, 'env'> {
  /** Node.js environment variables */
  env?: NodeJS.ProcessEnv
}

/**
 * Convert Node.js environment to generic record (pure function)
 */
const convertNodeEnv = (env?: NodeJS.ProcessEnv): Record<string, unknown> => {
  if (!env) return {}
  return Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>
}

/**
 * Create default plugins for Node.js runtime (pure function)
 */
const createDefaultPlugins = (env?: Record<string, unknown>): HatagoPlugin[] => {
  // Node.js runtime has full capabilities
  return [helloHatago]
}

/**
 * Configure MCP endpoint for Node.js runtime
 */
const configureMCPEndpoint = (
  app: NonNullable<Awaited<ReturnType<typeof createCoreApp>>['app']>,
  server: Awaited<ReturnType<typeof createCoreApp>>['server']
) => {
  app.all('/mcp', async c => {
    const transport = new StreamableHTTPTransport()
    // Initialize sessionId to satisfy Transport interface requirement
    transport.sessionId = transport.sessionId ?? ''
    await server.connect(transport as Transport)
    return transport.handleRequest(c)
  })
}

/**
 * Create Hatago application for Node.js runtime
 * Pure function that bridges Node.js specific APIs to the core
 */
export async function createApp(options: CreateNodeAppOptions = {}) {
  const { plugins, ...coreOptions } = options

  // Convert Node.js env to generic record - pure function
  const env = convertNodeEnv(options.env)

  // Use default plugins if none specified - pure function
  const finalPlugins = plugins ?? createDefaultPlugins(env)

  // Create core app - side effect contained
  const { app, server, ctx } = await createCoreApp({
    ...coreOptions,
    env,
    plugins: finalPlugins,
  })

  // Configure MCP endpoint if HTTP mode - side effect contained
  if (app) {
    configureMCPEndpoint(app, server)
  }

  return { app, server, ctx }
}
