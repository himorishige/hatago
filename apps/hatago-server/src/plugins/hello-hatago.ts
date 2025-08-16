import type { HatagoPlugin } from '../system/types.ts'
import { logger } from '../utils/logger.js'

/**
 * POC: streams "Hello Hatago" via MCP progress notifications
 * and returns the final text as tool result.
 *
 * Tool name: hello_hatago
 */
export const helloHatago =
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
      async (_args: Record<string, unknown>, extra: any) => {
        const text =
          'Hello Hatago! This is a test string with approximately 100 characters for progress notification.'
        const chars = text.split('')

        // Access progressToken from _meta parameter
        const token = (extra as any)._meta?.progressToken

        const { sendNotification } = extra
        if (token && typeof sendNotification === 'function') {
          logger.debug('Testing extended StreamableHTTPTransport progress notifications', {
            tool: 'hello_hatago',
            progressToken: token,
          })

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
              logger.warn(`Progress notification ${i + 1} failed`, {
                tool: 'hello_hatago',
                notification_index: i + 1,
                error: { message: (error as Error).message, stack: (error as Error).stack },
              })
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
            logger.warn('Final progress notification failed', {
              tool: 'hello_hatago',
              error: { message: (error as Error).message, stack: (error as Error).stack },
            })
          }
        }

        return {
          content: [{ type: 'text', text }],
        }
      }
    )
  }

export default helloHatago
