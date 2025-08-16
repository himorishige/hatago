import type { HatagoPlugin, HatagoPluginFactory } from '../types.js'

/**
 * POC: streams "Hello Hatago" via MCP progress notifications
 * and returns the final text as tool result.
 *
 * Tool name: hello_hatago
 */
export const helloHatago: HatagoPluginFactory =
  (): HatagoPlugin =>
  ({ server }) => {
    server.registerTool(
      'hello_hatago',
      {
        title: 'Hello Hatago',
        description: 'Emit progress that spells Hello Hatago, then return the text',
        // no inputs
        inputSchema: {},
      },
      // handler receives (args, extra)
      async (_args, extra) => {
        const text =
          'Hello Hatago! This is a test string with approximately 100 characters for progress notification.'
        const chars = text.split('')

        // Access progressToken from _meta parameter
        const token = (extra as any)._meta?.progressToken

        const { sendNotification } = extra
        if (token && typeof sendNotification === 'function') {
          console.log('Testing extended StreamableHTTPTransport progress notifications')

          // Send progress notifications for each character
          for (let i = 0; i < chars.length; i++) {
            try {
              await sendNotification({
                method: 'notifications/progress',
                params: {
                  progressToken: token,
                  progress: i + 1,
                  total: chars.length,
                  message: `Processing character: "${chars[i]}" (${i + 1}/${chars.length})`,
                },
              })
              // No delay for performance testing
              // await new Promise(resolve => setTimeout(resolve, 100))
            } catch (error) {
              console.error(`Progress notification ${i + 1} failed:`, (error as Error).message)
            }
          }

          // Final completion notification
          try {
            await sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken: token,
                progress: chars.length,
                total: chars.length,
                message: 'Processing complete!',
              },
            })
          } catch (error) {
            console.error('Final progress notification failed:', (error as Error).message)
          }
        }

        return {
          content: [{ type: 'text', text }],
        }
      }
    )
  }

export default helloHatago
