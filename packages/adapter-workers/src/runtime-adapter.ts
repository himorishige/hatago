import { normalizeEnv } from '@hatago/core'
import type { RuntimeAdapter } from '@hatago/core/types/runtime'

/**
 * Cloudflare Workers runtime adapter implementation
 * Following Hono's approach: minimal abstraction, leverage Web Standards
 *
 * Note: Environment variables in Workers are passed through the `env` parameter
 * in fetch handlers, not through a global process object
 */
export const workersRuntimeAdapter: RuntimeAdapter = {
  getEnv: () => {
    // In Workers, environment variables are not globally accessible
    // They must be passed through the context
    return undefined
  },

  getAllEnv: () => {
    // Workers doesn't have global access to all env vars
    return {}
  },

  runtime: 'workers' as const,

  hasCapability: (_api: 'crypto' | 'fetch' | 'performance' | 'streams') => {
    // Cloudflare Workers has all Web Standards APIs
    return true
  },
}

/**
 * Create a Workers runtime adapter with environment context
 * This allows passing environment variables from the Workers context
 */
export function createWorkersRuntimeAdapter(env?: Record<string, unknown>): RuntimeAdapter {
  const normalizedEnv = normalizeEnv(env)

  return {
    getEnv: (key: string) => normalizedEnv[key],
    getAllEnv: () => normalizedEnv,
    runtime: 'workers' as const,
    hasCapability: () => true, // Workers has all Web APIs
  }
}
