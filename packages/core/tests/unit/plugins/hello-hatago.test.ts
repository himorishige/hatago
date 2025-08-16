import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helloHatago } from '../../../src/plugins/hello-hatago.js'
import type { HatagoContext } from '../../../src/types.js'

describe('helloHatago plugin', () => {
  let ctx: HatagoContext
  let registeredTool: any
  let toolHandler: any

  beforeEach(() => {
    const server = new McpServer({ name: 'test', version: '1.0.0' })

    // Mock registerTool to capture the registration
    server.registerTool = vi.fn((name, descriptor, handler) => {
      registeredTool = { name, descriptor }
      toolHandler = handler
    })

    ctx = {
      app: null,
      server,
      env: {},
      getBaseUrl: (req: Request) => new URL(req.url),
      mode: 'http',
    }
  })

  it('should register hello_hatago tool', () => {
    const plugin = helloHatago()
    plugin(ctx)

    expect(ctx.server.registerTool).toHaveBeenCalledOnce()
    expect(registeredTool.name).toBe('hello_hatago')
    expect(registeredTool.descriptor.title).toBe('Hello Hatago')
    expect(registeredTool.descriptor.description).toContain('Emit progress')
    expect(registeredTool.descriptor.inputSchema).toEqual({})
  })

  it('should return text content without progress token', async () => {
    const plugin = helloHatago()
    plugin(ctx)

    const result = await toolHandler({}, { sendNotification: undefined })

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Hello Hatago! This is a test string with approximately 100 characters for progress notification.',
        },
      ],
    })
  })

  it('should send progress notifications when token provided', async () => {
    const plugin = helloHatago()
    plugin(ctx)

    const sendNotification = vi.fn()
    const progressToken = 'test-token-123'

    const result = await toolHandler(
      {},
      {
        sendNotification,
        _meta: { progressToken },
      }
    )

    // Check that progress notifications were sent
    expect(sendNotification).toHaveBeenCalled()

    // Check first notification
    const firstCall = sendNotification.mock.calls[0][0]
    expect(firstCall.method).toBe('notifications/progress')
    expect(firstCall.params.progressToken).toBe(progressToken)
    expect(firstCall.params.progress).toBe(1)
    expect(firstCall.params.message).toContain('H')

    // Check last notification (completion)
    const lastCall = sendNotification.mock.calls[sendNotification.mock.calls.length - 1][0]
    expect(lastCall.params.message).toBe('Processing complete!')
    expect(lastCall.params.progress).toBe(lastCall.params.total)

    // Check result
    expect(result.content[0].text).toContain('Hello Hatago!')
  })

  it('should handle notification errors gracefully', async () => {
    const plugin = helloHatago()
    plugin(ctx)

    const sendNotification = vi.fn().mockRejectedValue(new Error('Network error'))
    const progressToken = 'test-token-123'

    // Mock console.error to suppress error output
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await toolHandler(
      {},
      {
        sendNotification,
        _meta: { progressToken },
      }
    )

    // Should still return result even if notifications fail
    expect(result.content[0].text).toContain('Hello Hatago!')

    // Should have logged errors
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('should work without sendNotification function', async () => {
    const plugin = helloHatago()
    plugin(ctx)

    const result = await toolHandler(
      {},
      {
        _meta: { progressToken: 'token' },
        // No sendNotification provided
      }
    )

    expect(result.content[0].text).toContain('Hello Hatago!')
  })

  it('should send correct number of progress notifications', async () => {
    const plugin = helloHatago()
    plugin(ctx)

    const sendNotification = vi.fn()
    const progressToken = 'test-token-123'

    await toolHandler(
      {},
      {
        sendNotification,
        _meta: { progressToken },
      }
    )

    const text =
      'Hello Hatago! This is a test string with approximately 100 characters for progress notification.'
    const expectedCalls = text.length + 1 // One for each character + final completion

    expect(sendNotification).toHaveBeenCalledTimes(expectedCalls)
  })
})
