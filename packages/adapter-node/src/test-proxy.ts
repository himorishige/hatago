#!/usr/bin/env node

import { helloHatago } from '@hatago/core'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'

async function testProxy() {
  // Create app with basic configuration (proxy disabled for now)
  const { app } = await createApp({
    name: 'hatago-proxy-test',
    version: '0.1.0',
    plugins: [
      // Include local hello plugin
      helloHatago,
      // TODO: Re-implement MCP proxy plugin
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
  console.log('   Note: Proxy functionality temporarily disabled during refactoring')

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
