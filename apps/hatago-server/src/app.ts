/**
 * Reference implementation using @hatago/core
 */
import { createApp as createCoreApp } from '@hatago/core'
import type { CreateAppOptions } from '@hatago/core'

export async function createApp(options: CreateAppOptions = {}) {
  // Simply delegate to core implementation
  return createCoreApp(options)
}

export type { CreateAppOptions, HatagoContext, HatagoMode, HatagoPlugin } from '@hatago/core'
