import { createAdapter } from '@hatago/core'
import type { ServeOptions } from '@hatago/core'
/**
 * Node.js adapter for Hatago
 */
import { serve as honoServe } from '@hono/node-server'

export const nodeAdapter = createAdapter('node', {
  features: {
    streams: true,
    websockets: true,
    filesystem: true,
    edge: false,
    staticFiles: true,
  },

  async serve(options: ServeOptions) {
    const { app, port = 8787, hostname = 'localhost' } = options

    console.log(`🚀 Hatago Node.js adapter starting on http://${hostname}:${port}`)

    return honoServe({
      fetch: app.fetch,
      port,
      hostname,
    })
  },

  async build(options) {
    // Node.js doesn't need a build step for development
    // This could be implemented for production bundles
    console.log('Build not implemented for Node.js adapter')
  },
})

export function serve(options: ServeOptions) {
  return nodeAdapter.serve(options)
}
