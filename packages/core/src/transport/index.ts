/**
 * MCP Transport abstraction layer
 *
 * This module provides a wrapper around MCP transport implementations
 * to allow easy switching between official and internal implementations.
 */

// For now, use internal enhanced implementation
// Future: Switch to official @hono/mcp when it supports all required features
export { StreamableHTTPTransport } from '@hatago/hono-mcp'

// Type re-exports for convenience
export type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

/**
 * Configuration for switching between transport implementations
 */
export const TRANSPORT_CONFIG = {
  // Set to true when official @hono/mcp supports all Hatago features
  USE_OFFICIAL_HONO_MCP: false,
  // Version requirement for official implementation
  REQUIRED_HONO_MCP_VERSION: '0.2.0',
  // Features that must be supported before switching
  REQUIRED_FEATURES: [
    'event-store',
    'session-management',
    'dns-rebinding-protection',
    'progress-notifications',
    'resumability',
  ],
} as const
