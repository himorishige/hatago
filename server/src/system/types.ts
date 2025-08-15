import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Hono } from 'hono'

export type HatagoContext = {
  app: Hono
  server: McpServer
  env?: Record<string, unknown>
  /**
   * Return origin/base URL for the current request.
   * NOTE: only reliable at request-time (inside route handlers).
   */
  getBaseUrl: (req: Request) => URL
}

export type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>
