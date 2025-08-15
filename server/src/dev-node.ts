import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 8787)
const { app } = await createApp(process.env)
console.log(`Hatago listening on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
