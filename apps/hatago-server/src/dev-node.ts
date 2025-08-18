/**
 * Reference server using @hatago/adapter-node with proper signal handling
 */
import { serve } from '@hatago/adapter-node'
import { createApp } from '@hatago/core'
import { createDefaultLogger } from '@hatago/core'
import { createPlugins } from './plugins/index.js'

const port = Number(process.env.PORT || 8787)
const hostname = process.env.HOSTNAME || 'localhost'
const logger = createDefaultLogger()

const { app } = await createApp({
  env: process.env,
  mode: 'http',
  plugins: createPlugins(process.env),
})

if (!app) {
  logger.error('Failed to create HTTP app')
  process.exit(1)
}

logger.info('Hatago HTTP server starting', {
  port,
  mode: 'http',
  url: `http://${hostname}:${port}`,
})

const server = await serve({ app, port, hostname })

let isShuttingDown = false

// Graceful shutdown handler
const gracefulShutdown = (signal: string) => {
  console.log(`\n📡 Received ${signal}, starting graceful shutdown...`)

  if (isShuttingDown) {
    console.log('⚠️  Already shutting down, forcing exit...')
    process.exit(1)
  }

  isShuttingDown = true

  // Set timeout for forced shutdown (5 seconds for dev)
  const forceShutdownTimer = setTimeout(() => {
    console.log('⏰ Graceful shutdown timeout, forcing exit...')
    process.exit(1)
  }, 5000)

  // Close server gracefully
  if (server && typeof (server as any).close === 'function') {
    ;(server as any).close(() => {
      console.log('✅ Server closed successfully')
      clearTimeout(forceShutdownTimer)
      process.exit(0)
    })
  } else if (server && typeof (server as any).stop === 'function') {
    // Some servers use stop instead of close
    ;(server as any).stop(() => {
      console.log('✅ Server stopped successfully')
      clearTimeout(forceShutdownTimer)
      process.exit(0)
    })
  } else {
    // Fallback: force exit after short delay
    console.log('⚠️  Server close method not available, forcing exit...')
    clearTimeout(forceShutdownTimer)
    process.exit(0)
  }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  console.error('💥 Uncaught Exception:', error)
  gracefulShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason)
  gracefulShutdown('UNHANDLED_REJECTION')
})
