import type { HatagoContext } from '@hatago/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helloHatago } from '../src/index.js'

// Mock @hatago/core
vi.mock('@hatago/core', () => ({
  createDefaultLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

describe('Hello Hatago Plugin', () => {
  let mockContext: HatagoContext
  let mockServer: any
  let mockSendNotification: any

  beforeEach(() => {
    mockSendNotification = vi.fn()
    mockServer = {
      registerTool: vi.fn(),
    }

    mockContext = {
      app: null,
      server: mockServer,
      env: {},
      getBaseUrl: vi.fn(),
      mode: 'stdio',
    }
  })

  it('should register hello_hatago tool', async () => {
    const plugin = helloHatago()
    await plugin(mockContext)

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'hello_hatago',
      expect.objectContaining({
        title: 'Hello Hatago',
        description: 'Emit progress that spells Hello Hatago, then return the text',
        inputSchema: {},
      }),
      expect.any(Function)
    )
  })

  it('should handle tool execution without progress token', async () => {
    const plugin = helloHatago()
    await plugin(mockContext)

    // Get the handler function
    const toolHandler = mockServer.registerTool.mock.calls[0][2]

    const result = await toolHandler({}, {})

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Hello Hatago! This is a test string with approximately 100 characters for progress notification.',
        },
      ],
    })
  })

  it('should send progress notifications when token is provided', async () => {
    const plugin = helloHatago()
    await plugin(mockContext)

    // Get the handler function
    const toolHandler = mockServer.registerTool.mock.calls[0][2]

    const extra = {
      _meta: { progressToken: 'test-token' },
      sendNotification: mockSendNotification,
    }

    const result = await toolHandler({}, extra)

    // Should have sent progress notifications for each character
    const expectedText =
      'Hello Hatago! This is a test string with approximately 100 characters for progress notification.'
    expect(mockSendNotification).toHaveBeenCalledTimes(expectedText.length + 1) // +1 for final notification

    // Check first progress notification
    expect(mockSendNotification).toHaveBeenNthCalledWith(1, {
      method: 'notifications/progress',
      params: {
        progressToken: 'test-token',
        progress: 1,
        total: expectedText.length,
        message: 'Processing character: "H" (1/96)',
      },
    })

    // Check final notification
    expect(mockSendNotification).toHaveBeenLastCalledWith({
      method: 'notifications/progress',
      params: {
        progressToken: 'test-token',
        progress: expectedText.length,
        total: expectedText.length,
        message: 'Processing complete!',
      },
    })

    // Should return the final result
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: expectedText,
        },
      ],
    })
  })

  it('should handle sendNotification errors gracefully', async () => {
    const plugin = helloHatago()
    await plugin(mockContext)

    const toolHandler = mockServer.registerTool.mock.calls[0][2]

    // Mock sendNotification to throw error
    const failingSendNotification = vi.fn().mockRejectedValue(new Error('Network error'))

    const extra = {
      _meta: { progressToken: 'test-token' },
      sendNotification: failingSendNotification,
    }

    // Should not throw error even if notifications fail
    const result = await toolHandler({}, extra)

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Hello Hatago! This is a test string with approximately 100 characters for progress notification.',
        },
      ],
    })
  })

  it('should work without sendNotification function', async () => {
    const plugin = helloHatago()
    await plugin(mockContext)

    const toolHandler = mockServer.registerTool.mock.calls[0][2]

    const extra = {
      _meta: { progressToken: 'test-token' },
      // No sendNotification function
    }

    const result = await toolHandler({}, extra)

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Hello Hatago! This is a test string with approximately 100 characters for progress notification.',
        },
      ],
    })
  })

  it('should be exported as default', () => {
    expect(helloHatago).toBeDefined()
    expect(typeof helloHatago).toBe('function')
  })
})
