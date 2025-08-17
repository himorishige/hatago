/**
 * Reference implementation using @hatago/core
 */
import { createApp as createCoreApp } from '@hatago/core'
import type { CreateAppOptions } from '@hatago/core'
import { createPlugins } from './plugins/index.js'

export async function createApp(options: CreateAppOptions = {}) {
  // Create plugins based on environment variables
  const plugins = createPlugins(options.env)
  
  // Delegate to core implementation with dynamic plugins
  const { app, server, ctx } = await createCoreApp({
    ...options,
    plugins,
  })
  
  return { app, server, ctx }
}

export type { CreateAppOptions, HatagoContext, HatagoMode, HatagoPlugin } from '@hatago/core'
