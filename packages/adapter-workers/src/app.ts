import { type CreateAppOptions, createApp as createCoreApp, helloHatago } from '@hatago/core'
import type { HatagoPlugin } from '@hatago/core'
import { createWorkersRuntimeAdapter } from './runtime-adapter.js'

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

  // Create runtime adapter with Workers environment
  const runtimeAdapter = createWorkersRuntimeAdapter(options.env)

  // Create core app with Workers runtime adapter
  const { app, server, ctx } = await createCoreApp({
    ...coreOptions,
    env: options.env ?? {},
    plugins: finalPlugins,
    runtimeAdapter,
  })

  return { app, server, ctx }
}
