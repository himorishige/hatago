/**
 * Reference server using @hatago/adapter-node
 */
import { serve } from '@hatago/adapter-node'
import { LoggerLevel, createApp } from '@hatago/core'
import { createDefaultLogger } from '@hatago/core'

const port = Number(process.env.PORT || 8787)
const logger = createDefaultLogger()

const { app } = await createApp({ env: process.env, mode: 'http' })

if (!app) {
  logger.error('Failed to create HTTP app')
  process.exit(1)
}

logger.info('Hatago HTTP server starting', {
  port,
  mode: 'http',
  url: `http://localhost:${port}`,
})

serve({ app, port })
