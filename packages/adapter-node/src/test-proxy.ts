#!/usr/bin/env node

import { helloHatago, mcpProxy } from '@hatago/core'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'

async function testProxy() {
  // Create app with MCP proxy configuration
  const { app } = await createApp({
    name: 'hatago-proxy-test',
    version: '0.1.0',
    plugins: [
      // Include local hello plugin
      helloHatago(),

      // Add MCP proxy to existing server
      mcpProxy({
        server: {
          id: 'original-hatago',
          endpoint: 'http://localhost:8788',
          timeout: 10000,
        },
      }),
    ],
  })

  if (!app) {
    console.error('❌ Failed to create HTTP app')
    process.exit(1)
  }

  const port = 8787
  console.log(`🚀 Hatago Proxy Test starting on http://localhost:${port}`)
  console.log(`   Health: http://localhost:${port}/health`)
  console.log(`   MCP:    http://localhost:${port}/mcp`)
  console.log('   Proxying: original-hatago at http://localhost:8788')

  return serve({
    fetch: app?.fetch,
    port,
  })
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await testProxy()
  } catch (error) {
    console.error('❌ Failed to start Hatago proxy test:', error)
    process.exit(1)
  }
}
