import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.js'

describe('createApp', () => {
  describe('HTTP mode', () => {
    it('should create app with default options', async () => {
      const { app, server, ctx } = await createApp()

      expect(app).toBeDefined()
      expect(server).toBeDefined()
      expect(ctx).toBeDefined()
      expect(ctx.mode).toBe('http')
    })

    it('should create app with custom name and version', async () => {
      const { app } = await createApp({
        name: 'test-app',
        version: '1.0.0',
      })

      if (!app) throw new Error('App should be defined in HTTP mode')

      // Test via health endpoint which includes name and version
      const request = new Request('http://localhost/health')
      const response = await app.fetch(request)
      const data = await response.json()

      expect(data.name).toBe('test-app')
      expect(data.version).toBe('1.0.0')
    })

    it('should apply plugins', async () => {
      const mockPlugin = vi.fn()

      await createApp({
        plugins: [mockPlugin],
      })

      expect(mockPlugin).toHaveBeenCalledOnce()
      expect(mockPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          app: expect.anything(),
          server: expect.anything(),
          env: expect.any(Object),
          getBaseUrl: expect.any(Function),
        })
      )
    })

    it('should pass environment variables to context', async () => {
      const env = { TEST_VAR: 'test-value' }
      const { ctx } = await createApp({ env })

      expect(ctx.env).toEqual(env)
    })

    it('should add health endpoint in HTTP mode', async () => {
      const { app } = await createApp({
        name: 'test-app',
        version: '1.0.0',
      })

      if (!app) throw new Error('App should be defined in HTTP mode')

      const request = new Request('http://localhost/health')
      const response = await app.fetch(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('ok', true)
      expect(data).toHaveProperty('name', 'test-app')
      expect(data).toHaveProperty('version', '1.0.0')
      expect(data).toHaveProperty('timestamp')
    })

    it('should add root endpoint in HTTP mode', async () => {
      const { app } = await createApp({
        name: 'test-app',
        version: '1.0.0',
      })

      if (!app) throw new Error('App should be defined in HTTP mode')

      const request = new Request('http://localhost/')
      const response = await app.fetch(request)
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(html).toContain('test-app')
      expect(html).toContain('1.0.0')
    })
  })

  describe('stdio mode', () => {
    it('should create server without app in stdio mode', async () => {
      const { app, server, ctx } = await createApp({
        mode: 'stdio',
      })

      expect(app).toBeNull()
      expect(server).toBeDefined()
      expect(ctx).toBeDefined()
      expect(ctx.mode).toBe('stdio')
    })

    it('should not add HTTP endpoints in stdio mode', async () => {
      const { app } = await createApp({
        mode: 'stdio',
      })

      expect(app).toBeNull()
    })

    it('should still apply plugins in stdio mode', async () => {
      const mockPlugin = vi.fn()

      await createApp({
        mode: 'stdio',
        plugins: [mockPlugin],
      })

      expect(mockPlugin).toHaveBeenCalledOnce()
      expect(mockPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          app: null,
          server: expect.anything(),
          env: expect.any(Object),
          getBaseUrl: expect.any(Function),
          mode: 'stdio',
        })
      )
    })
  })

  describe('getBaseUrl helper', () => {
    it('should extract base URL from request', async () => {
      const { ctx } = await createApp()

      const request = new Request('http://example.com:8080/path?query=1')
      const baseUrl = ctx.getBaseUrl(request)

      expect(baseUrl.toString()).toBe('http://example.com:8080/')
    })
  })
})
