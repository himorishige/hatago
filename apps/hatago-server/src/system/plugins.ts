import type { HatagoContext, HatagoPlugin } from './types.ts'

export async function applyPlugins(plugins: HatagoPlugin[], ctx: HatagoContext) {
  for (const p of plugins) {
    await p(ctx)
  }
}
