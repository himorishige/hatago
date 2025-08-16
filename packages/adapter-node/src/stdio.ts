#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createApp } from './app.js'

export async function startStdioServer() {
  const { server } = await createApp({
    name: 'hatago-stdio',
    version: '0.1.0',
    mode: 'stdio',
  })

  console.error('🚀 Hatago stdio server starting...')

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('✅ Hatago stdio server ready')
}

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await startStdioServer()
  } catch (error) {
    console.error('❌ Failed to start Hatago stdio server:', error)
    process.exit(1)
  }
}
