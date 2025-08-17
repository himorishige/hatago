/**
 * Reference server using @hatago/adapter-node
 */
import { serve } from '@hatago/adapter-node'
import { createApp } from '@hatago/core'
import { createDefaultLogger } from '@hatago/core'
<<<<<<< Updated upstream
=======
import { createPlugins } from './plugins/index.js'
>>>>>>> Stashed changes

const port = Number(process.env.PORT || 8787)
const logger = createDefaultLogger()

<<<<<<< Updated upstream
const { app } = await createApp({ env: process.env, mode: 'http' })
=======
const { app } = await createApp({
  env: process.env,
  mode: 'http',
  plugins: createPlugins(process.env),
})
>>>>>>> Stashed changes

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
