#!/usr/bin/env node

import { serve } from '@hono/node-server'
import { createApp } from './app.js'

export interface ServeOptions {
  port?: number
  hostname?: string
  env?: NodeJS.ProcessEnv
  gracefulTimeoutMs?: number
}

let isShuttingDown = false

/**
 * Create and serve Hatago on Node.js with graceful shutdown
 */
export async function serveApp(options: ServeOptions = {}) {
  const {
    port = Number(process.env.PORT) || 8787,
    hostname = process.env.HOSTNAME || 'localhost',
    env = process.env,
    gracefulTimeoutMs = Number(process.env.GRACEFUL_TIMEOUT_MS) || 30000,
  } = options

  const { app } = await createApp({ env })

  if (!app) {
    console.error('❌ Failed to create HTTP app')
    process.exit(1)
  }

  console.log(`🚀 Hatago starting on http://${hostname}:${port}`)
  console.log(`   Health: http://${hostname}:${port}/health/live`)
  console.log(`   Ready:  http://${hostname}:${port}/health/ready`)
  console.log(`   MCP:    http://${hostname}:${port}/mcp`)

  const server = serve({
    fetch: app?.fetch,
    port,
    hostname,
  })

  // Graceful shutdown handler
  const gracefulShutdown = (signal: string) => {
    console.log(`\n📡 Received ${signal}, starting graceful shutdown...`)

    if (isShuttingDown) {
      console.log('⚠️  Already shutting down, forcing exit...')
      process.exit(1)
    }

    isShuttingDown = true

    // Set draining mode
    fetch(`http://${hostname}:${port}/drain`, { method: 'POST' })
      .then(() => console.log('🚰 Server is now draining...'))
      .catch(error => console.log('⚠️  Could not set drain mode:', error.message))

    // Set timeout for forced shutdown
    const forceShutdownTimer = setTimeout(() => {
      console.log('⏰ Graceful shutdown timeout, forcing exit...')
      process.exit(1)
    }, gracefulTimeoutMs)

    // Close server gracefully
    if (server && typeof server.close === 'function') {
      server.close(() => {
        console.log('✅ Server closed successfully')
        clearTimeout(forceShutdownTimer)
        process.exit(0)
      })
    } else {
      // For @hono/node-server, try alternative shutdown
      console.log('⚠️  Standard server close not available, attempting alternative shutdown...')
      setTimeout(() => {
        clearTimeout(forceShutdownTimer)
        process.exit(0)
      }, 1000)
    }
  }

  // Register signal handlers only once
  if (!process.listenerCount('SIGTERM')) {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  }
  if (!process.listenerCount('SIGINT')) {
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  }

  // Handle uncaught exceptions and unhandled rejections
  if (!process.listenerCount('uncaughtException')) {
    process.on('uncaughtException', error => {
      console.error('💥 Uncaught Exception:', error)
      gracefulShutdown('UNCAUGHT_EXCEPTION')
    })
  }

  if (!process.listenerCount('unhandledRejection')) {
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
      gracefulShutdown('UNHANDLED_REJECTION')
    })
  }

  return server
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await serveApp()
  } catch (error) {
    console.error('❌ Failed to start Hatago:', error)
    process.exit(1)
  }
}
