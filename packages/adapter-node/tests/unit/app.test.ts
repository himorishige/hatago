import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.js'

describe('createApp (Node.js adapter)', () => {
  it('should create app with default plugins', async () => {
    const { app, server, ctx } = await createApp()

    expect(app).toBeDefined()
    expect(server).toBeDefined()
    expect(ctx).toBeDefined()
  })

  it('should convert Node.js env to generic record', async () => {
    const nodeEnv: NodeJS.ProcessEnv = {
      TEST_VAR: 'test-value',
      UNDEFINED_VAR: undefined,
    }

    const { ctx } = await createApp({ env: nodeEnv })

    // Should filter out undefined values
    expect(ctx.env).toEqual({ TEST_VAR: 'test-value' })
    expect(ctx.env).not.toHaveProperty('UNDEFINED_VAR')
  })

  it('should use custom plugins when provided', async () => {
    const mockPlugin = vi.fn()

    await createApp({
      plugins: [mockPlugin],
    })

    expect(mockPlugin).toHaveBeenCalledOnce()
  })

  it('should work in stdio mode', async () => {
    const { app, server } = await createApp({
      mode: 'stdio',
    })

    expect(app).toBeNull()
    expect(server).toBeDefined()
  })
})
