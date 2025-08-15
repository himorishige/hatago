import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Hono } from 'hono'

export type HatagoMode = 'http' | 'stdio'

export type HatagoContext = {
  app: Hono | null // null in stdio mode since HTTP routes are not available
  server: McpServer
  env?: Record<string, unknown>
  mode: HatagoMode
  /**
   * Return origin/base URL for the current request.
   * NOTE: only reliable at request-time (inside route handlers) and in http mode.
   */
  getBaseUrl: (req: Request) => URL
}

export type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>
