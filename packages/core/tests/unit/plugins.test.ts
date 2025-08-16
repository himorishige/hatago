import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it, vi } from 'vitest'
import { applyPlugins } from '../../src/plugins.js'
import type { HatagoContext, HatagoPlugin } from '../../src/types.js'

describe('applyPlugins', () => {
  const createMockContext = (): HatagoContext => ({
    app: null,
    server: new McpServer({ name: 'test', version: '1.0.0' }),
    env: {},
    getBaseUrl: (req: Request) => new URL(req.url),
    mode: 'http',
  })

  it('should apply single plugin', async () => {
    const mockPlugin = vi.fn()
    const ctx = createMockContext()

    await applyPlugins([mockPlugin], ctx)

    expect(mockPlugin).toHaveBeenCalledOnce()
    expect(mockPlugin).toHaveBeenCalledWith(ctx)
  })

  it('should apply multiple plugins in order', async () => {
    const callOrder: number[] = []
    const plugin1: HatagoPlugin = () => {
      callOrder.push(1)
    }
    const plugin2: HatagoPlugin = () => {
      callOrder.push(2)
    }
    const plugin3: HatagoPlugin = () => {
      callOrder.push(3)
    }

    const ctx = createMockContext()

    await applyPlugins([plugin1, plugin2, plugin3], ctx)

    expect(callOrder).toEqual([1, 2, 3])
  })

  it('should handle async plugins', async () => {
    const asyncPlugin: HatagoPlugin = async ctx => {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (ctx.env) {
        ctx.env.asyncCompleted = true
      }
    }

    const ctx = createMockContext()

    await applyPlugins([asyncPlugin], ctx)

    expect(ctx.env?.asyncCompleted).toBe(true)
  })

  it('should throw on plugin errors', async () => {
    const errorPlugin: HatagoPlugin = () => {
      throw new Error('Plugin error')
    }
    const successPlugin = vi.fn()

    const ctx = createMockContext()

    // Should throw
    await expect(applyPlugins([errorPlugin, successPlugin], ctx)).rejects.toThrowError(
      'Plugin error'
    )

    // Subsequent plugins should NOT be called due to error
    expect(successPlugin).not.toHaveBeenCalled()
  })

  it('should pass context to all plugins', async () => {
    const plugin1 = vi.fn()
    const plugin2 = vi.fn()

    const ctx = createMockContext()
    if (ctx.env) {
      ctx.env.customValue = 'test'
    }

    await applyPlugins([plugin1, plugin2], ctx)

    expect(plugin1).toHaveBeenCalledWith(
      expect.objectContaining({
        server: ctx.server,
        env: expect.objectContaining({ customValue: 'test' }),
      })
    )

    expect(plugin2).toHaveBeenCalledWith(
      expect.objectContaining({
        server: ctx.server,
        env: expect.objectContaining({ customValue: 'test' }),
      })
    )
  })

  it('should handle empty plugin array', async () => {
    const ctx = createMockContext()

    await expect(applyPlugins([], ctx)).resolves.toBeUndefined()
  })

  it('should allow plugins to modify context', async () => {
    const modifyingPlugin: HatagoPlugin = ctx => {
      if (ctx.env) {
        ctx.env.modified = true
      }
      ctx.server.registerTool(
        'test_tool',
        {
          title: 'Test Tool',
          description: 'A test tool',
          inputSchema: {},
        },
        async () => ({
          content: [{ type: 'text', text: 'test' }],
        })
      )
    }

    const ctx = createMockContext()

    await applyPlugins([modifyingPlugin], ctx)

    expect(ctx.env?.modified).toBe(true)
    // Note: We can't easily verify tool registration without accessing internal state
  })
})
