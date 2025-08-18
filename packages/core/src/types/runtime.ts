/**
 * Runtime adapter interface for abstracting runtime-specific APIs
 * Following Hono's approach: minimal abstraction, leverage Web Standards
 */

/**
 * Runtime key following WinterCG runtime keys convention
 */
export type RuntimeKey = 'node' | 'deno' | 'bun' | 'workers' | 'edge-light' | 'fastly' | 'other'

/**
 * Minimal runtime adapter focusing only on environment variables
 * All other APIs should use Web Standards directly
 */
export interface RuntimeAdapter {
  // Environment variables - the only part that needs abstraction
  /** Get a single environment variable */
  getEnv(key: string): string | undefined
  /** Get all environment variables */
  getAllEnv(): Record<string, string | undefined>

  // Runtime information
  /** The runtime type */
  runtime: RuntimeKey

  // Web Standards API availability check
  /** Check if a Web Standard API is available */
  hasCapability?(api: 'crypto' | 'fetch' | 'performance' | 'streams'): boolean
}

/**
 * Detect runtime following Hono's approach
 * Prioritize navigator.userAgent, fall back to global object checks
 */
export function detectRuntime(): RuntimeKey {
  // Check navigator.userAgent first (most reliable)
  if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
    const ua = navigator.userAgent
    if (ua.includes('Cloudflare-Workers')) return 'workers'
    if (ua.includes('Deno')) return 'deno'
    if (ua.includes('Bun')) return 'bun'
  }

  // Fall back to global object checks
  const global = globalThis as any

  // Edge runtime
  if (typeof global?.EdgeRuntime === 'string') return 'edge-light'

  // Fastly
  if (global?.fastly !== undefined) return 'fastly'

  // Deno
  if (global?.Deno !== undefined) return 'deno'

  // Bun
  if (global?.Bun !== undefined) return 'bun'

  // Cloudflare Workers
  if (typeof global?.WebSocketPair === 'function') return 'workers'

  // Node.js
  if (global?.process?.release?.name === 'node') return 'node'

  return 'other'
}

/**
 * Default runtime adapter with automatic detection
 */
export const defaultRuntimeAdapter: RuntimeAdapter = {
  getEnv: () => undefined,
  getAllEnv: () => ({}),
  runtime: detectRuntime(),
  hasCapability: api => {
    switch (api) {
      case 'crypto':
        return typeof globalThis.crypto !== 'undefined'
      case 'fetch':
        return typeof globalThis.fetch === 'function'
      case 'performance':
        return typeof globalThis.performance !== 'undefined'
      case 'streams':
        return typeof globalThis.ReadableStream !== 'undefined'
      default:
        return false
    }
  },
}

/**
 * Helper to get environment variables across runtimes
 * Inspired by Hono's env() helper
 */
export function getEnvironment(adapter?: RuntimeAdapter): Record<string, string | undefined> {
  const runtime = adapter?.runtime ?? detectRuntime()
  const global = globalThis as any

  switch (runtime) {
    case 'node':
    case 'bun':
    case 'edge-light':
      return global?.process?.env ?? {}
    case 'deno':
      // @ts-ignore - Deno global
      return typeof Deno !== 'undefined' ? Deno.env.toObject() : {}
    case 'workers':
      // In Workers, env is passed through context
      return adapter?.getAllEnv() ?? {}
    default:
      return {}
  }
}
