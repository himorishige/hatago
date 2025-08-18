/**
 * Tests for Process Sandbox
 */

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerManifest } from './manifest.js'
import { ProcessSandbox } from './sandbox.js'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
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

describe('ProcessSandbox', () => {
  let sandbox: ProcessSandbox
  let mockProcess: any

  beforeEach(() => {
    sandbox = new ProcessSandbox()

    // Create mock child process
    mockProcess = new EventEmitter()
    mockProcess.pid = 12345
    mockProcess.kill = vi.fn()
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()

    // Setup spawn mock
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('start', () => {
    it('should start a new process', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']

      const process = await sandbox.start(manifest, command)

      expect(process.id).toBe('test-server')
      expect(process.state).toBe('running')
      expect(process.pid).toBe(12345)
      expect(process.startTime).toBeInstanceOf(Date)
      expect(process.restartCount).toBe(0)

      expect(spawn).toHaveBeenCalledWith(
        'npx',
        ['--no', '@test/server'],
        expect.objectContaining({
          env: expect.objectContaining({
            MCP_SANDBOX: 'true',
            MCP_SERVER_ID: 'test-server',
          }),
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      )
    })

    it('should reject starting duplicate process', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']

      await sandbox.start(manifest, command)

      await expect(sandbox.start(manifest, command)).rejects.toThrow(
        'Process test-server is already running'
      )
    })

    it('should apply environment variables', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        env: {
          CUSTOM_VAR: 'value',
          API_KEY: 'secret',
        },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']

      await sandbox.start(manifest, command)

      expect(spawn).toHaveBeenCalledWith(
        'npx',
        ['--no', '@test/server'],
        expect.objectContaining({
          env: expect.objectContaining({
            CUSTOM_VAR: 'value',
            API_KEY: 'secret',
            MCP_SANDBOX: 'true',
            MCP_SERVER_ID: 'test-server',
          }),
        })
      )
    })

    it('should handle output events', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const onOutput = vi.fn()
      const command = ['npx', '--no', '@test/server']

      await sandbox.start(manifest, command, { onOutput })

      // Simulate output
      mockProcess.stdout.emit('data', Buffer.from('Hello from server'))

      expect(onOutput).toHaveBeenCalledWith('Hello from server')
    })

    it('should handle process errors', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const onError = vi.fn()
      const command = ['npx', '--no', '@test/server']

      const process = await sandbox.start(manifest, command, { onError })

      // Simulate error
      const error = new Error('Process failed')
      mockProcess.emit('error', error)

      expect(onError).toHaveBeenCalledWith(error)
      expect(process.state).toBe('failed')
      expect(process.lastError).toBe('Process failed')
    })
  })

  describe('stop', () => {
    it('should stop a running process gracefully', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      const process = await sandbox.start(manifest, command)

      // Start stopping
      const stopPromise = sandbox.stop('test-server')

      // Simulate process exit
      mockProcess.emit('exit', 0, null)

      await stopPromise

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
      expect(process.state).toBe('stopped')
      expect(process.stopTime).toBeInstanceOf(Date)
    })

    it('should force stop a process', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      await sandbox.start(manifest, command)

      // Force stop
      const stopPromise = sandbox.stop('test-server', true)

      // Simulate process exit
      mockProcess.emit('exit', 0, null)

      await stopPromise

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL')
    })

    it('should reject stopping non-existent process', async () => {
      await expect(sandbox.stop('non-existent')).rejects.toThrow(
        'Process non-existent is not running'
      )
    })
  })

  describe('restart', () => {
    it('should restart a process', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      const _process = await sandbox.start(manifest, command)

      // Create new mock process for restart
      const newMockProcess = new EventEmitter()
      newMockProcess.pid = 67890
      newMockProcess.kill = vi.fn()
      newMockProcess.stdout = new EventEmitter()
      newMockProcess.stderr = new EventEmitter()

      vi.mocked(spawn).mockReturnValueOnce(newMockProcess as any)

      // Restart
      const restartPromise = sandbox.restart('test-server')

      // Simulate old process exit
      mockProcess.emit('exit', 0, null)

      const newProcess = await restartPromise

      expect(newProcess.id).toBe('test-server')
      expect(newProcess.restartCount).toBe(1)
      expect(newProcess.state).toBe('running')
    })

    it('should enforce restart limit', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 1,
      }

      const command = ['npx', '--no', '@test/server']
      const process = await sandbox.start(manifest, command)

      // Set restart count to max
      process.restartCount = 1

      // Simulate process exit first
      mockProcess.emit('exit', 0, null)

      await expect(sandbox.restart('test-server')).rejects.toThrow(
        'Process test-server exceeded maximum restart attempts (1)'
      )
    })
  })

  describe('auto-restart', () => {
    it('should auto-restart on failure', async () => {
      vi.useFakeTimers()

      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      await sandbox.start(manifest, command)

      // Create new mock process for restart
      const newMockProcess = new EventEmitter()
      newMockProcess.pid = 67890
      newMockProcess.kill = vi.fn()
      newMockProcess.stdout = new EventEmitter()
      newMockProcess.stderr = new EventEmitter()

      vi.mocked(spawn).mockReturnValueOnce(newMockProcess as any)

      // Simulate process crash
      mockProcess.emit('exit', 1, null)

      // Wait for auto-restart timer
      await vi.advanceTimersByTimeAsync(1000)

      expect(spawn).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('should not auto-restart on clean exit', async () => {
      vi.useFakeTimers()

      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      await sandbox.start(manifest, command)

      // Simulate clean exit
      mockProcess.emit('exit', 0, null)

      // Wait to ensure no restart
      await vi.advanceTimersByTimeAsync(2000)

      // Should only be called once (initial start)
      expect(spawn).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('process listing', () => {
    it('should list all processes', async () => {
      const manifest1: ServerManifest = {
        id: 'server-1',
        name: 'Server 1',
        package: '@test/server1',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const manifest2: ServerManifest = {
        id: 'server-2',
        name: 'Server 2',
        package: '@test/server2',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      // Create different mock processes
      const mockProcess2 = new EventEmitter()
      mockProcess2.pid = 54321
      mockProcess2.kill = vi.fn()
      mockProcess2.stdout = new EventEmitter()
      mockProcess2.stderr = new EventEmitter()

      vi.mocked(spawn)
        .mockReturnValueOnce(mockProcess as any)
        .mockReturnValueOnce(mockProcess2 as any)

      await sandbox.start(manifest1, ['npx', '--no', '@test/server1'])
      await sandbox.start(manifest2, ['npx', '--no', '@test/server2'])

      const processes = sandbox.listProcesses()

      expect(processes).toHaveLength(2)
      expect(processes.map(p => p.id)).toEqual(['server-1', 'server-2'])
    })

    it('should get specific process', async () => {
      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      await sandbox.start(manifest, command)

      const process = sandbox.getProcess('test-server')

      expect(process).toBeDefined()
      expect(process?.id).toBe('test-server')
      expect(process?.state).toBe('running')
    })

    it('should return undefined for non-existent process', () => {
      const process = sandbox.getProcess('non-existent')
      expect(process).toBeUndefined()
    })
  })

  describe('event emission', () => {
    it('should emit state-change events', async () => {
      const stateChangeHandler = vi.fn()
      sandbox.on('state-change', stateChangeHandler)

      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      await sandbox.start(manifest, command)

      expect(stateChangeHandler).toHaveBeenCalledWith(
        'running',
        expect.objectContaining({ id: 'test-server' })
      )
    })

    it('should emit output events', async () => {
      const outputHandler = vi.fn()
      sandbox.on('output', outputHandler)

      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      await sandbox.start(manifest, command)

      // Simulate output
      mockProcess.stdout.emit('data', Buffer.from('Test output'))

      expect(outputHandler).toHaveBeenCalledWith(
        'Test output',
        expect.objectContaining({ id: 'test-server' })
      )
    })

    it('should emit error events', async () => {
      const errorHandler = vi.fn()
      sandbox.on('error', errorHandler)

      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      await sandbox.start(manifest, command)

      // Simulate error
      const error = new Error('Test error')
      mockProcess.emit('error', error)

      expect(errorHandler).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ id: 'test-server' })
      )
    })

    it('should emit restart events', async () => {
      const restartHandler = vi.fn()
      sandbox.on('restart', restartHandler)

      const manifest: ServerManifest = {
        id: 'test-server',
        name: 'Test Server',
        package: '@test/server',
        packageManager: 'npx',
        transport: { type: 'stdio' },
        autoStart: false,
        restartOnFailure: true,
        maxRestarts: 3,
      }

      const command = ['npx', '--no', '@test/server']
      await sandbox.start(manifest, command)

      // Create new mock process for restart
      const newMockProcess = new EventEmitter()
      newMockProcess.pid = 67890
      newMockProcess.kill = vi.fn()
      newMockProcess.stdout = new EventEmitter()
      newMockProcess.stderr = new EventEmitter()

      vi.mocked(spawn).mockReturnValueOnce(newMockProcess as any)

      // Restart
      const restartPromise = sandbox.restart('test-server')

      // Simulate old process exit
      mockProcess.emit('exit', 0, null)

      await restartPromise

      expect(restartHandler).toHaveBeenCalledWith(1, expect.objectContaining({ id: 'test-server' }))
    })
  })
})
