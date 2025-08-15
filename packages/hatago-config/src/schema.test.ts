import { describe, test, expect } from 'vitest'
import { HatagoConfigSchema, MCPServerConfigSchema } from './schema.js'

describe('HatagoConfigSchema', () => {
  test('validates minimal configuration', () => {
    const config = {}
    const result = HatagoConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  test('validates complete configuration', () => {
    const config = {
      proxy: {
        servers: [
          {
            id: 'test-server',
            endpoint: 'http://localhost:8080',
            namespace: 'test',
            description: 'Test server',
          },
        ],
        namespaceStrategy: 'prefix' as const,
        conflictResolution: 'error' as const,
      },
      server: {
        port: 8787,
        hostname: 'localhost',
        cors: true,
        timeout: 30000,
      },
      logging: {
        level: 'info' as const,
        format: 'pretty' as const,
        output: 'console' as const,
      },
    }

    const result = HatagoConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  test('rejects invalid configuration', () => {
    const config = {
      proxy: {
        servers: [
          {
            // Missing required id and endpoint
            namespace: 'test',
          },
        ],
      },
      server: {
        port: -1, // Invalid port
      },
    }

    const result = HatagoConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0)
    }
  })
})

describe('MCPServerConfigSchema', () => {
  test('validates server with authentication', () => {
    const server = {
      id: 'auth-server',
      endpoint: 'https://api.example.com/mcp',
      auth: {
        type: 'bearer' as const,
        token: 'secret-token',
      },
      tools: {
        rename: {
          'old.name': 'new.name',
        },
        exclude: ['debug.*'],
        include: ['*'],
      },
      timeout: 10000,
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 5000,
      },
    }

    const result = MCPServerConfigSchema.safeParse(server)
    expect(result.success).toBe(true)
  })

  test('rejects invalid endpoint URL', () => {
    const server = {
      id: 'invalid-server',
      endpoint: 'not-a-url',
    }

    const result = MCPServerConfigSchema.safeParse(server)
    expect(result.success).toBe(false)
  })

  test('applies default values', () => {
    const server = {
      id: 'minimal-server',
      endpoint: 'http://localhost:8080',
    }

    const result = MCPServerConfigSchema.parse(server)
    expect(result.timeout).toBe(30000) // Default timeout
  })
})
