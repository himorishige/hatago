import { StreamableHTTPTransport } from '@hatago/hono-mcp'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { Hono } from 'hono'

/**
 * Configure MCP endpoint for HTTP transport
 * This function sets up the standard /mcp endpoint for both Node.js and Workers
 */
export const setupMCPEndpoint = (app: Hono, server: McpServer): void => {
  app.all('/mcp', async c => {
    const transport = new StreamableHTTPTransport()
    // Initialize sessionId to satisfy Transport interface requirement
    transport.sessionId = transport.sessionId ?? ''
    await server.connect(transport as Transport)
    return transport.handleRequest(c)
  })
}
