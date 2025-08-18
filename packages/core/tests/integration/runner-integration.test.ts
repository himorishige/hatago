/**
 * Runner Plugin Integration Tests
 * Tests actual process management and MCP server lifecycle
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RunnerManager } from '../../src/runner/manager.js'
import type { RunnerConfig, ServerManifest } from '../../src/runner/manifest.js'
import { ProcessSandbox } from '../../src/runner/sandbox.js'
import { TestMCPClient } from '../helpers/mcp-client.js'
import { createMockMCPServer, createStdioMockServer } from '../helpers/mock-servers.js'
import { startHatagoServer } from '../helpers/server-spawn.js'

describe.skip('Runner Integration Tests', () => {
  let manager: RunnerManager
  let sandbox: ProcessSandbox

  beforeEach(() => {
    sandbox = new ProcessSandbox()
  })

  afterEach(async () => {
    // Cleanup all processes
    const processes = sandbox.listProcesses()
    for (const proc of processes) {
      if (proc.state === 'running') {
        await sandbox.stop(proc.id, true)
      }
    }

    if (manager) {
      await manager.stopAll()
    }
  })

  describe('Process Lifecycle Management', () => {
    it('should start and stop MCP server process', async () => {
      const manifest: ServerManifest = {
        id: 'test-stdio-server',
        name: 'Test Stdio Server',
        package: '@modelcontextprotocol/server-everything',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()

      // Start the server
      await manager.startServer('test-stdio-server')

      // Check server is running
      const servers = manager.listServers()
      const server = servers.find(s => s.id === 'test-stdio-server')

      expect(server).toBeDefined()
      expect(server?.status).toBe('running')
      expect(server?.process?.state).toBe('running')
      expect(server?.process?.pid).toBeGreaterThan(0)

      // Get MCP client
      const client = manager.getConnection('test-stdio-server')
      expect(client).toBeDefined()

      // Try to list tools
      const tools = await client?.request('tools/list')
      expect(tools).toBeDefined()
      expect(tools.tools).toBeInstanceOf(Array)

      // Stop the server
      await manager.stopServer('test-stdio-server')

      // Check server is stopped
      const stoppedServers = manager.listServers()
      const stoppedServer = stoppedServers.find(s => s.id === 'test-stdio-server')

      expect(stoppedServer?.status).toBe('registered')
      expect(stoppedServer?.process).toBeUndefined()
    }, 30000) // 30 second timeout for npm install

    it('should handle multiple servers simultaneously', async () => {
      const config: RunnerConfig = {
        servers: [
          {
            id: 'server-1',
            name: 'Server 1',
            package: '@modelcontextprotocol/server-filesystem',
            packageManager: 'npx',
            transport: { type: 'stdio' },
            args: ['--readonly', '/tmp'],
            autoStart: true,
            restartOnFailure: false,
            maxRestarts: 3,
          },
          {
            id: 'server-2',
            name: 'Server 2',
            package: '@modelcontextprotocol/server-brave-search',
            packageManager: 'npx',
            transport: { type: 'stdio' },
            env: { BRAVE_API_KEY: 'test-key' },
            autoStart: true,
            restartOnFailure: false,
            maxRestarts: 3,
          },
        ],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()

      // Check both servers started
      const servers = manager.listServers()

      expect(servers).toHaveLength(2)
      expect(servers[0].status).toBe('running')
      expect(servers[1].status).toBe('running')

      // Get clients for both
      const client1 = manager.getConnection('server-1')
      const client2 = manager.getConnection('server-2')

      expect(client1).toBeDefined()
      expect(client2).toBeDefined()

      // Stop all
      await manager.stopServer('server-1')
      await manager.stopServer('server-2')
    }, 30000)

    it('should auto-restart failed servers', async () => {
      // Create a test server that will crash
      const manifest: ServerManifest = {
        id: 'crash-server',
        name: 'Crash Server',
        package: 'exit', // Simple command that exits
        packageManager: 'npx',
        args: ['1'], // Exit with code 1
        transport: { type: 'stdio' },
        autoStart: true,
        restartOnFailure: true,
        maxRestarts: 2,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)

      let restartCount = 0
      manager.on('restart', () => {
        restartCount++
      })

      await manager.autoStart()

      // Wait for restarts
      await new Promise(resolve => setTimeout(resolve, 3000))

      expect(restartCount).toBeGreaterThanOrEqual(1)
      expect(restartCount).toBeLessThanOrEqual(2) // Max restarts
    })
  })

  describe('Transport Integration', () => {
    it('should connect via stdio transport', async () => {
      const manifest: ServerManifest = {
        id: 'stdio-test',
        name: 'Stdio Test',
        package: '@modelcontextprotocol/server-filesystem',
        packageManager: 'npx',
        args: ['--readonly', '/tmp'],
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()
      await manager.startServer('stdio-test')

      const client = manager.getConnection('stdio-test')
      expect(client).toBeDefined()

      // Test MCP communication
      const result = await client?.request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      })

      expect(result).toBeDefined()
      expect(result.protocolVersion).toBe('2025-06-18')
      expect(result.serverInfo).toBeDefined()
    }, 30000)

    it('should handle HTTP transport servers', async () => {
      // HTTP transport servers run as separate processes
      const manifest: ServerManifest = {
        id: 'http-test',
        name: 'HTTP Test',
        package: '@modelcontextprotocol/server-puppeteer',
        packageManager: 'npx',
        transport: {
          type: 'http',
          port: 3456,
        },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()
      await manager.startServer('http-test')

      // For HTTP transport, we need to connect differently
      const servers = manager.listServers()
      const server = servers.find(s => s.id === 'http-test')

      expect(server?.status).toBe('running')
      expect(server?.process?.state).toBe('running')

      // Test HTTP connection
      const client = new TestMCPClient({
        baseUrl: `http://localhost:${manifest.transport.port}`,
      })

      await client.initialize()
      const tools = await client.listTools()
      expect(tools.tools).toBeInstanceOf(Array)

      await manager.stopServer('http-test')
    }, 30000)
  })

  describe('Health Monitoring', () => {
    it('should perform health checks on running servers', async () => {
      const manifest: ServerManifest = {
        id: 'health-test',
        name: 'Health Test',
        package: '@modelcontextprotocol/server-filesystem',
        packageManager: 'npx',
        args: ['--readonly', '/tmp'],
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()
      await manager.startServer('health-test')

      // Perform health check
      const health = await manager.healthCheck('health-test')

      expect(health.healthy).toBe(true)
      expect(health.latency).toBeGreaterThan(0)
      expect(health.tools).toBeInstanceOf(Array)

      await manager.stopServer('health-test')
    }, 30000)

    it('should detect unhealthy servers', async () => {
      const manifest: ServerManifest = {
        id: 'unhealthy-test',
        name: 'Unhealthy Test',
        package: 'false', // Command that does nothing
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()

      // Try to start (will fail)
      try {
        await manager.startServer('unhealthy-test')
      } catch {
        // Expected to fail
      }

      // Health check should report unhealthy
      const health = await manager.healthCheck('unhealthy-test')

      expect(health.healthy).toBe(false)
      expect(health.error).toBeDefined()
    })
  })

  describe('Security Sandboxing', () => {
    it('should apply permission restrictions', async () => {
      const manifest: ServerManifest = {
        id: 'restricted-server',
        name: 'Restricted Server',
        package: '@modelcontextprotocol/server-filesystem',
        packageManager: 'npx',
        args: ['--readonly', '/tmp'],
        transport: { type: 'stdio' },
        permissions: {
          network: false,
          fsRead: true,
          fsWrite: false,
          env: false,
          spawn: false,
          allowedPaths: ['/tmp'],
        },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()
      await manager.startServer('restricted-server')

      const client = manager.getConnection('restricted-server')
      expect(client).toBeDefined()

      // Server should be running with restrictions
      const servers = manager.listServers()
      const server = servers.find(s => s.id === 'restricted-server')

      expect(server?.status).toBe('running')
      expect(server?.manifest.permissions?.network).toBe(false)
      expect(server?.manifest.permissions?.fsWrite).toBe(false)

      await manager.stopServer('restricted-server')
    }, 30000)

    it('should apply resource limits', async () => {
      const manifest: ServerManifest = {
        id: 'limited-server',
        name: 'Limited Server',
        package: '@modelcontextprotocol/server-filesystem',
        packageManager: 'npx',
        args: ['--readonly', '/tmp'],
        transport: { type: 'stdio' },
        limits: {
          memory: 256, // 256MB
          cpuTime: 60, // 60 seconds
          timeout: 30, // 30 second timeout
        },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()
      await manager.startServer('limited-server')

      // Server should be running with limits
      const servers = manager.listServers()
      const server = servers.find(s => s.id === 'limited-server')

      expect(server?.status).toBe('running')
      expect(server?.manifest.limits?.memory).toBe(256)

      await manager.stopServer('limited-server')
    }, 30000)
  })

  describe('Error Recovery', () => {
    it('should handle server startup failures gracefully', async () => {
      const manifest: ServerManifest = {
        id: 'invalid-server',
        name: 'Invalid Server',
        package: '@nonexistent/package-that-does-not-exist',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()

      // Should fail to start
      await expect(manager.startServer('invalid-server')).rejects.toThrow()

      // Server should be in failed state
      const servers = manager.listServers()
      const server = servers.find(s => s.id === 'invalid-server')

      expect(server?.status).toBe('registered')
    })

    it('should handle connection timeouts', async () => {
      const manifest: ServerManifest = {
        id: 'timeout-server',
        name: 'Timeout Server',
        package: 'sleep', // Command that sleeps
        packageManager: 'npx',
        args: ['60'], // Sleep for 60 seconds
        transport: { type: 'stdio' },
        limits: {
          timeout: 1, // 1 second timeout
        },
        autoStart: false,
        restartOnFailure: false,
        maxRestarts: 3,
      }

      const config: RunnerConfig = {
        servers: [manifest],
      }

      manager = new RunnerManager(config)
      await manager.autoStart()

      // Should timeout
      await expect(manager.startServer('timeout-server')).rejects.toThrow()
    })
  })
})
