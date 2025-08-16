import type { HatagoContext } from '@hatago/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type OAuthMetadataOptions, oauthMetadata } from '../src/index.js'

describe('OAuth Metadata Plugin', () => {
  let mockContext: HatagoContext
  let mockApp: any
  let mockGetBaseUrl: any

  beforeEach(() => {
    mockApp = {
      get: vi.fn(),
      use: vi.fn(),
    }

    mockGetBaseUrl = vi.fn(() => new URL('https://api.example.com'))

    mockContext = {
      app: mockApp,
      server: { registerTool: vi.fn() },
      env: {},
      getBaseUrl: mockGetBaseUrl,
      mode: 'http',
    }
  })

  it('should register protected resource metadata endpoint', () => {
    const plugin = oauthMetadata()
    plugin(mockContext)

    expect(mockApp.get).toHaveBeenCalledWith(
      '/.well-known/oauth-protected-resource',
      expect.any(Function)
    )
  })

  it('should not register routes in stdio mode', () => {
    mockContext.mode = 'stdio'
    mockContext.app = null

    const plugin = oauthMetadata()
    plugin(mockContext)

    expect(mockApp.get).not.toHaveBeenCalled()
  })

  it('should return correct protected resource metadata', () => {
    const options: OAuthMetadataOptions = {
      issuer: 'https://auth.example.com',
      resource: 'https://api.example.com',
      scopes: ['read', 'write'],
    }

    const plugin = oauthMetadata(options)
    plugin(mockContext)

    // Get the handler for protected resource metadata
    const handler = mockApp.get.mock.calls[0][1]
    const mockHandlerContext = {
      json: vi.fn(),
    }

    handler(mockHandlerContext)

    expect(mockHandlerContext.json).toHaveBeenCalledWith({
      resource: 'https://api.example.com',
      authorization_servers: ['https://auth.example.com'],
      scopes_supported: ['read', 'write'],
      bearer_methods_supported: ['header'],
      resource_name: 'Hatago MCP',
      resource_documentation: 'https://api.example.com/docs',
    })
  })

  it('should derive resource from request URL when not specified', () => {
    mockGetBaseUrl.mockReturnValue(new URL('https://my-api.com'))

    const plugin = oauthMetadata()
    plugin(mockContext)

    const handler = mockApp.get.mock.calls[0][1]
    const mockHandlerContext = {
      req: { raw: new Request('https://my-api.com/.well-known/oauth-protected-resource') },
      json: vi.fn(),
    }

    handler(mockHandlerContext)

    expect(mockGetBaseUrl).toHaveBeenCalledWith(mockHandlerContext.req.raw)
    expect(mockHandlerContext.json).toHaveBeenCalledWith({
      resource: 'https://my-api.com',
      scopes_supported: ['mcp:read', 'mcp:invoke'],
      bearer_methods_supported: ['header'],
      resource_name: 'Hatago MCP',
      resource_documentation: 'https://my-api.com/docs',
    })
  })

  it('should register authorization server metadata when issuer is provided', () => {
    const options: OAuthMetadataOptions = {
      issuer: 'https://auth.example.com',
    }

    const plugin = oauthMetadata(options)
    plugin(mockContext)

    expect(mockApp.get).toHaveBeenCalledWith(
      '/.well-known/oauth-authorization-server',
      expect.any(Function)
    )

    // Get the authorization server handler
    const handler = mockApp.get.mock.calls[1][1]
    const mockHandlerContext = {
      json: vi.fn(),
    }

    handler(mockHandlerContext)

    expect(mockHandlerContext.json).toHaveBeenCalledWith({
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    })
  })

  it('should not register authorization server metadata without issuer', () => {
    const plugin = oauthMetadata()
    plugin(mockContext)

    expect(mockApp.get).toHaveBeenCalledTimes(1) // Only protected resource endpoint
  })

  it('should register authentication middleware when requireAuth is true', () => {
    const options: OAuthMetadataOptions = {
      requireAuth: true,
      resource: 'https://api.example.com',
    }

    const plugin = oauthMetadata(options)
    plugin(mockContext)

    expect(mockApp.use).toHaveBeenCalledWith('/mcp', expect.any(Function))
  })

  it('should allow requests with valid Bearer token', async () => {
    const options: OAuthMetadataOptions = {
      requireAuth: true,
    }

    const plugin = oauthMetadata(options)
    plugin(mockContext)

    const middleware = mockApp.use.mock.calls[0][1]
    const mockNext = vi.fn()
    const mockHandlerContext = {
      req: {
        header: vi.fn().mockReturnValue('Bearer valid-token'),
      },
    }

    await middleware(mockHandlerContext, mockNext)

    expect(mockNext).toHaveBeenCalled()
  })

  it('should reject requests without Bearer token', async () => {
    const options: OAuthMetadataOptions = {
      requireAuth: true,
      resource: 'https://api.example.com',
    }

    const plugin = oauthMetadata(options)
    plugin(mockContext)

    const middleware = mockApp.use.mock.calls[0][1]
    const mockNext = vi.fn()
    const mockHandlerContext = {
      req: {
        header: vi.fn().mockReturnValue(''),
        raw: new Request('https://api.example.com/mcp'),
      },
      header: vi.fn(),
      body: vi.fn(),
    }

    const _result = await middleware(mockHandlerContext, mockNext)

    expect(mockNext).not.toHaveBeenCalled()
    expect(mockHandlerContext.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"'
    )
    expect(mockHandlerContext.body).toHaveBeenCalledWith(null, 401)
  })

  it('should use default scopes when not specified', () => {
    const plugin = oauthMetadata()
    plugin(mockContext)

    const handler = mockApp.get.mock.calls[0][1]
    const mockHandlerContext = {
      req: { raw: new Request('https://example.com/.well-known/oauth-protected-resource') },
      json: vi.fn(),
    }

    handler(mockHandlerContext)

    expect(mockHandlerContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes_supported: ['mcp:read', 'mcp:invoke'],
      })
    )
  })

  it('should not register middleware when requireAuth is false', () => {
    const options: OAuthMetadataOptions = {
      requireAuth: false,
    }

    const plugin = oauthMetadata(options)
    plugin(mockContext)

    expect(mockApp.use).not.toHaveBeenCalled()
  })
})
