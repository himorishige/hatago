/**
 * Hatago Adapter Interface
 * Provides a unified interface for runtime adapters
 */

import type { Hono } from 'hono'

export interface AdapterFeatures {
  streams: boolean
  websockets: boolean
  filesystem: boolean
  edge: boolean
  staticFiles: boolean
}

export interface ServeOptions {
  app: Hono
  port?: number
  hostname?: string
  env?: Record<string, unknown>
  [key: string]: unknown
}

export interface BuildOptions {
  app: Hono
  outDir?: string
  env?: Record<string, unknown>
  [key: string]: unknown
}

export interface HatagoAdapter {
  name: string
  features: AdapterFeatures
  serve(options: ServeOptions): Promise<unknown>
  build?(options: BuildOptions): Promise<void>
}

/**
 * Create an adapter with default features
 */
export function createAdapter(
  name: string,
  implementation: Omit<HatagoAdapter, 'name'>
): HatagoAdapter {
  return {
    name,
    ...implementation,
  }
}
