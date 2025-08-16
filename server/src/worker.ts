import { createApp } from './app.js'

export default {
  fetch: async (req: Request, env: Record<string, unknown>, ctx: unknown) => {
    const { app } = await createApp({ env, mode: 'http' })
    if (!app) {
      throw new Error('Failed to create HTTP app for Cloudflare Workers')
    }
    return app.fetch(req, env, ctx as any)
  },
}
