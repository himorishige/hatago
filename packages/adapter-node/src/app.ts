import {
  type CreateAppOptions,
  convertNodeEnv,
  createApp as createCoreApp,
  helloHatago,
} from '@hatago/core'
import type { HatagoPlugin } from '@hatago/core'
import { nodeRuntimeAdapter } from './runtime-adapter.js'

export interface CreateNodeAppOptions extends Omit<CreateAppOptions, 'env'> {
  /** Node.js environment variables */
  env?: NodeJS.ProcessEnv
}

/**
 * Create default plugins for Node.js runtime (pure function)
 */
const createDefaultPlugins = (_env?: Record<string, unknown>): HatagoPlugin[] => {
  // Node.js runtime has full capabilities
  return [helloHatago]
}

/**
 * Create Hatago application for Node.js runtime
 * Pure function that bridges Node.js specific APIs to the core
 */
export async function createApp(options: CreateNodeAppOptions = {}) {
  const { plugins, ...coreOptions } = options

  // Convert Node.js env to generic record using shared utility
  const env = convertNodeEnv(options.env)

  // Use default plugins if none specified
  const finalPlugins = plugins ?? createDefaultPlugins(env)

  // Create core app with Node.js runtime adapter
  const { app, server, ctx } = await createCoreApp({
    ...coreOptions,
    env,
    plugins: finalPlugins,
    runtimeAdapter: nodeRuntimeAdapter,
  })

  return { app, server, ctx }
}
