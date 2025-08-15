import { createApp } from './app.js'

export default {
  fetch: async (req: Request, env: Record<string, unknown>) => {
    const { app } = await createApp({
      name: 'hatago',
      version: '0.1.0',
      env,
    })
    return app.fetch(req, env)
  },
}
