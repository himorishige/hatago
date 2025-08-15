#!/usr/bin/env tsx

/**
 * Hatago stdio MCP Server
 * 
 * This server runs in stdio mode for direct integration with MCP clients
 * like Claude Desktop that prefer process-based communication.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createApp } from './app.js'
import { logger } from './utils/logger.js'

/**
 * Create and start a stdio-based MCP server
 */
async function main() {
  try {
    // Create the Hatago app in stdio mode
    const { server } = await createApp({ 
      mode: 'stdio',
      env: process.env as any 
    })

    // Create stdio transport
    const transport = new StdioServerTransport()

    // Connect the server to stdio transport
    await server.connect(transport)

    // Log server startup
    logger.info('Hatago stdio MCP server started', { mode: 'stdio' })
    logger.info('Ready for MCP client connections')

  } catch (error) {
    logger.fatal('Failed to start stdio server', { 
      error: { message: (error as Error).message, stack: (error as Error).stack } 
    })
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down stdio server')
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down stdio server')
  process.exit(0)
})

// Start the server
main().catch((error) => {
  logger.fatal('Unexpected error in stdio server', { 
    error: { message: (error as Error).message, stack: (error as Error).stack } 
  })
})