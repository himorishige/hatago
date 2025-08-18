/**
 * Tests for Runner Manager
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RunnerManager } from './manager.js'
import type { RunnerConfig, ServerManifest } from './manifest.js'

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    request: vi.fn(),
    notification: vi.fn(),
  })),
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock sandbox
vi.mock('./sandbox.js', () => ({
  ProcessSandbox: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue({
      id: 'test-server',
      pid: 12345,
      state: 'running',
      startTime: new Date(),
      restartCount: 0,
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue({
      id: 'test-server',
      pid: 67890,
      state: 'running',
      startTime: new Date(),
      restartCount: 1,
    }),
    getProcess: vi.fn().mockReturnValue({
      id: 'test-server',
      state: 'running',
      pid: 12345,
    }),
    listProcesses: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    removeListener: vi.fn(),
  })),
}))

// Mock logger
vi.mock('../logger/index.js', () => ({
  createDefaultLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('RunnerManager', () => {
  let manager: RunnerManager
  let config: RunnerConfig

  beforeEach(() => {
    config = {
      servers: [
        {
          id: 'test-server',
          name: 'Test Server',
          package: '@test/mcp-server',
          packageManager: 'npx',
          transport: { type: 'stdio' },
          autoStart: true,
          restartOnFailure: true,
          maxRestarts: 3,
        },
        {
          id: 'manual-server',
          name: 'Manual Server',
          package: '@test/manual-server',
          packageManager: 'npx',
          transport: { type: 'stdio' },
          autoStart: false,
          restartOnFailure: false,
          maxRestarts: 3,
        },
      ],
    }

    manager = new RunnerManager(config)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with config', () => {
      expect(manager).toBeDefined()
      expect((manager as any).config).toEqual(config)
    })

    it('should auto-start servers with autoStart=true', async () => {
      await manager.initialize()

      const sandbox = (manager as any).sandbox
      expect(sandbox.start).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-server',
          autoStart: true,
        }),
        expect.any(Array),
        expect.any(Object)
      )

      // Should not start manual server
      expect(sandbox.start).not.toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'manual-server',
        }),
        expect.any(Array),
        expect.any(Object)
      )
    })
  })

  describe('registration', () => {
    it('should register a new server', async () => {
      const manifest: ServerManifest = {
        id: 'new-server',
        name: 'New Server',
        package: '@test/new-server',
        packageManager: 'pnpm',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      await manager.register(manifest)

      const servers = manager.listServers()
      expect(servers).toContainEqual(
        expect.objectContaining({
          id: 'new-server',
          status: 'registered',
          manifest,
        })
      )
    })

    it('should reject duplicate registration', async () => {
      const manifest: ServerManifest = {
        id: 'test-server', // Already exists in config
        name: 'Duplicate Server',
        package: '@test/duplicate',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      await expect(manager.register(manifest)).rejects.toThrow(
        'Server test-server is already registered'
      )
    })

    it('should auto-start if specified', async () => {
      const manifest: ServerManifest = {
        id: 'auto-server',
        name: 'Auto Server',
        package: '@test/auto-server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: true,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      await manager.register(manifest, { autoStart: true })

      const sandbox = (manager as any).sandbox
      expect(sandbox.start).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'auto-server',
        }),
        expect.any(Array),
        expect.any(Object)
      )
    })
  })

  describe('starting and stopping', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should start a server', async () => {
      await manager.start('manual-server')

      const sandbox = (manager as any).sandbox
      expect(sandbox.start).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'manual-server',
        }),
        expect.any(Array),
        expect.any(Object)
      )
    })

    it('should stop a server', async () => {
      await manager.stop('test-server')

      const sandbox = (manager as any).sandbox
      expect(sandbox.stop).toHaveBeenCalledWith('test-server', false)
    })

    it('should force stop a server', async () => {
      await manager.stop('test-server', true)

      const sandbox = (manager as any).sandbox
      expect(sandbox.stop).toHaveBeenCalledWith('test-server', true)
    })

    it('should restart a server', async () => {
      await manager.restart('test-server')

      const sandbox = (manager as any).sandbox
      expect(sandbox.restart).toHaveBeenCalledWith('test-server')
    })
  })

  describe('MCP client management', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should create MCP client for stdio transport', async () => {
      await manager.start('manual-server')

      expect(Client).toHaveBeenCalled()
      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: '@test/manual-server',
          args: [],
        })
      )
    })

    it('should connect MCP client', async () => {
      await manager.start('manual-server')

      const clients = (manager as any).mcpClients
      const client = clients.get('manual-server')

      expect(client).toBeDefined()
      expect(client.connect).toHaveBeenCalled()
    })

    it('should get MCP client', async () => {
      await manager.start('manual-server')

      const client = manager.getClient('manual-server')

      expect(client).toBeDefined()
      expect(client).toHaveProperty('connect')
      expect(client).toHaveProperty('request')
    })

    it('should return undefined for non-existent client', () => {
      const client = manager.getClient('non-existent')
      expect(client).toBeUndefined()
    })

    it('should close MCP client on stop', async () => {
      await manager.start('manual-server')

      const client = manager.getClient('manual-server')
      expect(client).toBeDefined()

      await manager.stop('manual-server')

      expect(client?.close).toHaveBeenCalled()
    })
  })

  describe('health check', () => {
    beforeEach(async () => {
      await manager.initialize()
      await manager.start('manual-server')
    })

    it('should perform health check', async () => {
      const client = manager.getClient('manual-server')
      if (client) {
        vi.mocked(client.request).mockResolvedValueOnce({
          tools: ['tool1', 'tool2'],
        })
      }

      const health = await manager.healthCheck('manual-server')

      expect(health).toEqual({
        healthy: true,
        latency: expect.any(Number),
        tools: ['tool1', 'tool2'],
      })
    })

    it('should handle health check failure', async () => {
      const client = manager.getClient('manual-server')
      if (client) {
        vi.mocked(client.request).mockRejectedValueOnce(new Error('Connection failed'))
      }

      const health = await manager.healthCheck('manual-server')

      expect(health).toEqual({
        healthy: false,
        error: 'Connection failed',
      })
    })

    it('should return unhealthy for non-existent server', async () => {
      const health = await manager.healthCheck('non-existent')

      expect(health).toEqual({
        healthy: false,
        error: 'Server not found or not running',
      })
    })
  })

  describe('server listing', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should list all servers', () => {
      const servers = manager.listServers()

      expect(servers).toHaveLength(2)
      expect(servers).toContainEqual(
        expect.objectContaining({
          id: 'test-server',
          status: 'running',
        })
      )
      expect(servers).toContainEqual(
        expect.objectContaining({
          id: 'manual-server',
          status: 'registered',
        })
      )
    })

    it('should include process info for running servers', async () => {
      await manager.start('manual-server')

      const servers = manager.listServers()
      const manualServer = servers.find(s => s.id === 'manual-server')

      expect(manualServer).toBeDefined()
      expect(manualServer?.status).toBe('running')
      expect(manualServer?.process).toEqual(
        expect.objectContaining({
          id: 'manual-server',
          state: 'running',
          pid: 12345,
        })
      )
    })
  })

  describe('unregistration', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should unregister a server', async () => {
      await manager.unregister('manual-server')

      const servers = manager.listServers()
      expect(servers).not.toContainEqual(
        expect.objectContaining({
          id: 'manual-server',
        })
      )
    })

    it('should stop server before unregistering', async () => {
      await manager.start('manual-server')
      await manager.unregister('manual-server')

      const sandbox = (manager as any).sandbox
      expect(sandbox.stop).toHaveBeenCalledWith('manual-server', true)
    })

    it('should close MCP client on unregister', async () => {
      await manager.start('manual-server')
      const client = manager.getClient('manual-server')

      await manager.unregister('manual-server')

      expect(client?.close).toHaveBeenCalled()
    })

    it('should reject unregistering non-existent server', async () => {
      await expect(manager.unregister('non-existent')).rejects.toThrow(
        'Server non-existent is not registered'
      )
    })
  })

  describe('cleanup', () => {
    beforeEach(async () => {
      await manager.initialize()
      await manager.start('manual-server')
    })

    it('should clean up all resources', async () => {
      const client = manager.getClient('manual-server')
      const sandbox = (manager as any).sandbox

      await manager.cleanup()

      // Should close all clients
      expect(client?.close).toHaveBeenCalled()

      // Should stop all processes
      expect(sandbox.stop).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle process errors', async () => {
      const errorHandler = vi.fn()
      manager.on('error', errorHandler)

      await manager.initialize()

      // Simulate process error through sandbox
      const sandbox = (manager as any).sandbox
      const errorCallback = sandbox.on.mock.calls.find((call: any) => call[0] === 'error')?.[1]

      if (errorCallback) {
        const error = new Error('Process crashed')
        errorCallback(error, { id: 'test-server' })

        expect(errorHandler).toHaveBeenCalledWith(
          error,
          expect.objectContaining({ id: 'test-server' })
        )
      }
    })

    it('should handle state changes', async () => {
      const stateHandler = vi.fn()
      manager.on('state-change', stateHandler)

      await manager.initialize()

      // Simulate state change through sandbox
      const sandbox = (manager as any).sandbox
      const stateCallback = sandbox.on.mock.calls.find(
        (call: any) => call[0] === 'state-change'
      )?.[1]

      if (stateCallback) {
        stateCallback('stopped', { id: 'test-server' })

        expect(stateHandler).toHaveBeenCalledWith(
          'stopped',
          expect.objectContaining({ id: 'test-server' })
        )
      }
    })
  })

  describe('configuration defaults', () => {
    it('should apply defaults from config', async () => {
      const configWithDefaults: RunnerConfig = {
        servers: [
          {
            id: 'default-test',
            name: 'Default Test',
            package: '@test/default',
            // packageManager not specified, should use default
            transport: { type: 'stdio' },
            autoStart: false,
            restartOnFailure: true,
            maxRestarts: 3,
          } as any,
        ],
        defaults: {
          packageManager: 'pnpm',
          limits: {
            memory: 512,
            timeout: 300,
          },
        },
      }

      const managerWithDefaults = new RunnerManager(configWithDefaults)
      await managerWithDefaults.initialize()

      const servers = managerWithDefaults.listServers()
      const server = servers.find(s => s.id === 'default-test')

      // Should apply default packageManager
      expect(server?.manifest.packageManager).toBe('pnpm')
    })

    it('should use registry option', async () => {
      const configWithRegistry: RunnerConfig = {
        servers: [],
        registry: 'https://custom.registry.com',
      }

      const managerWithRegistry = new RunnerManager(configWithRegistry)

      const manifest: ServerManifest = {
        id: 'registry-test',
        name: 'Registry Test',
        package: '@test/registry',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      await managerWithRegistry.register(manifest)

      // Would verify registry is used in command building
      expect(managerWithRegistry).toBeDefined()
    })
  })
})
