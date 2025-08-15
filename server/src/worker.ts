import { createApp } from './app.js'

export default {
  fetch: async (req: Request, env: Record<string, unknown>, ctx: any) => {
    const { app } = await createApp(env)
    return app.fetch(req, env, ctx)
  },
}
