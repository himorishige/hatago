import type { RuntimeAdapter } from '@hatago/core/types/runtime'

/**
 * Node.js runtime adapter implementation
 * Following Hono's approach: minimal abstraction, focus on env variables
 */
export const nodeRuntimeAdapter: RuntimeAdapter = {
  getEnv: (key: string) => process.env[key],

  getAllEnv: () => process.env as Record<string, string | undefined>,

  runtime: 'node' as const,

  hasCapability: (api: 'crypto' | 'fetch' | 'performance' | 'streams') => {
    switch (api) {
      case 'crypto':
        // Node.js 19+ has globalThis.crypto, older versions need polyfill
        return !!globalThis.crypto || !!require('node:crypto').webcrypto
      case 'fetch':
        // Node.js 18+ has native fetch
        return typeof globalThis.fetch === 'function'
      case 'performance':
        // Node.js has performance API
        return typeof globalThis.performance !== 'undefined'
      case 'streams':
        // Node.js has streams API
        return typeof globalThis.ReadableStream !== 'undefined'
      default:
        return false
    }
  },
}

/**
 * Create a Node.js runtime adapter
 * Optionally polyfill missing Web APIs for older Node.js versions
 */
export function createNodeRuntimeAdapter(options?: { polyfill?: boolean }): RuntimeAdapter {
  // Polyfill crypto for Node.js < 19
  if (options?.polyfill && !globalThis.crypto) {
    try {
      const { webcrypto } = require('node:crypto')
      ;(globalThis as any).crypto = webcrypto
    } catch {
      // Ignore if crypto module is not available
    }
  }

  return nodeRuntimeAdapter
}
