#!/usr/bin/env node

import { helloHatago, mcpProxy } from '@hatago/core'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'

async function testMultiProxy() {
  // Create app with multiple MCP proxy configuration
  const { app } = await createApp({
    name: 'hatago-multi-proxy-test',
    version: '0.1.0',
    plugins: [
      // Include local hello plugin
      helloHatago(),

      // Add MCP proxy with multiple servers
      mcpProxy({
        config: {
          servers: [
            {
              id: 'server-a',
              endpoint: 'http://localhost:8788',
              timeout: 10000,
            },
            {
              id: 'server-b',
              endpoint: 'http://localhost:8789',
              timeout: 10000,
            },
          ],
          namespaceStrategy: 'prefix',
          conflictResolution: 'first-wins',
        },
      }),
    ],
  })

  if (!app) {
    console.error('❌ Failed to create HTTP app')
    process.exit(1)
  }

  const port = 8787
  console.log(`🚀 Hatago Multi-Proxy Test starting on http://localhost:${port}`)
  console.log(`   Health: http://localhost:${port}/health`)
  console.log(`   MCP:    http://localhost:${port}/mcp`)
  console.log('   Proxying:')
  console.log('     - server-a at http://localhost:8788')
  console.log('     - server-b at http://localhost:8789')

  return serve({
    fetch: app!.fetch,
    port,
  })
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await testMultiProxy()
  } catch (error) {
    console.error('❌ Failed to start Hatago multi-proxy test:', error)
    process.exit(1)
  }
}
