import {
  type CreateAppOptions,
  createApp as createCoreApp,
  helloHatago,
  setupMCPEndpoint,
} from '@hatago/core'
import type { HatagoPlugin } from '@hatago/core'

export interface CreateWorkersAppOptions extends Omit<CreateAppOptions, 'env'> {
  /** Cloudflare Workers environment variables */
  env?: Record<string, unknown>
}

/**
 * Create default plugins for Workers runtime
 */
const createDefaultPlugins = (_env?: Record<string, unknown>): HatagoPlugin[] => {
  // Workers runtime has specific capabilities and constraints
  return [helloHatago]
}

/**
 * Create Hatago application for Cloudflare Workers runtime
 * Pure function that bridges Workers-specific APIs to the core
 */
export async function createApp(options: CreateWorkersAppOptions = {}) {
  const { plugins, ...coreOptions } = options

  // Use default plugins if none specified
  const finalPlugins = plugins ?? createDefaultPlugins(options.env)

  // Create core app
  const { app, server, ctx } = await createCoreApp({
    ...coreOptions,
    env: options.env ?? {},
    plugins: finalPlugins,
  })

  // Configure MCP endpoint using shared setup function
  if (app) {
    setupMCPEndpoint(app, server)
  }

  return { app, server, ctx }
}
