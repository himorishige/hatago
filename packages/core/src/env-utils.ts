/**
 * Environment variable utilities for cross-runtime compatibility
 * Following Hono's approach: no NodeJS types, pure functions
 */

/**
 * Normalize environment variables to consistent string format
 * Filters out undefined/null values and converts all values to strings
 */
export const normalizeEnv = (env?: Record<string, unknown>): Record<string, string> => {
  if (!env) return {}

  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    // Skip undefined and null values
    if (value !== undefined && value !== null) {
      result[key] = String(value)
    }
  }
  return result
}

/**
 * Convert Node.js style env to normalized format
 * This is for backward compatibility and will be deprecated
 */
export const convertNodeEnv = (env?: Record<string, unknown>): Record<string, unknown> => {
  return normalizeEnv(env)
}
