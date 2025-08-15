import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { logger } from './utils/logger.js'

const port = Number(process.env.PORT || 8787)
const { app } = await createApp({ env: process.env, mode: 'http' })

if (!app) {
  logger.fatal('Failed to create HTTP app')
}

logger.info('Hatago HTTP server starting', { 
  port, 
  mode: 'http',
  url: `http://localhost:${port}` 
})

serve({ fetch: app!.fetch, port })
