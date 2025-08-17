/**
 * Environment variable utilities for cross-runtime compatibility
 */

/**
 * Convert Node.js environment variables to generic record (pure function)
 * Filters out undefined values that are common in Node.js process.env
 */
export const convertNodeEnv = (env?: NodeJS.ProcessEnv): Record<string, unknown> => {
  if (!env) return {}
  return Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as Record<
    string,
    unknown
  >
}

/**
 * Normalize environment variables from any runtime to a consistent format
 * Handles both Node.js ProcessEnv and Workers env objects
 */
export const normalizeEnv = (
  env?: Record<string, unknown> | NodeJS.ProcessEnv
): Record<string, unknown> => {
  if (!env) return {}

  // Handle Node.js ProcessEnv (which has optional string values)
  if (typeof process !== 'undefined' && env === process.env) {
    return convertNodeEnv(env as NodeJS.ProcessEnv)
  }

  // Handle other runtime environments (Workers, etc.)
  return env as Record<string, unknown>
}
