/**
 * Simple hello world plugin for testing
 */
import type { HatagoPlugin } from '../types.js'

export const helloHatago: HatagoPlugin = async ctx => {
  const { server } = ctx

  server.registerTool(
    'hello_hatago',
    {
      title: 'Hello Hatago',
      description: 'Simple greeting tool for testing',
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: 'Hello from Hatago!',
          },
        ],
      }
    }
  )
}
