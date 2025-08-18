/**
 * Process sandboxing for secure MCP server execution
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createDefaultLogger } from '../logger/index.js'
import type { Permissions, ResourceLimits, ServerManifest } from './manifest.js'

const logger = createDefaultLogger('runner-sandbox')

/**
 * Process state
 */
export type ProcessState = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed'

/**
 * Sandboxed process
 */
export interface SandboxedProcess {
  id: string
  pid?: number
  state: ProcessState
  startTime?: Date
  stopTime?: Date
  restartCount: number
  lastError?: string
}

/**
 * Sandbox events
 */
export interface SandboxEvents {
  'state-change': (state: ProcessState, process: SandboxedProcess) => void
  output: (data: string, process: SandboxedProcess) => void
  error: (error: Error, process: SandboxedProcess) => void
  restart: (count: number, process: SandboxedProcess) => void
}

/**
 * Process sandbox for running MCP servers
 */
export class ProcessSandbox extends EventEmitter {
  private processes = new Map<
    string,
    {
      process: ChildProcess
      info: SandboxedProcess
      manifest: ServerManifest
    }
  >()

  /**
   * Start a sandboxed process
   */
  async start(
    manifest: ServerManifest,
    command: string[],
    options?: {
      onOutput?: (data: string) => void
      onError?: (error: Error) => void
    }
  ): Promise<SandboxedProcess> {
    const existing = this.processes.get(manifest.id)
    if (existing) {
      throw new Error(`Process ${manifest.id} is already running`)
    }

    const info: SandboxedProcess = {
      id: manifest.id,
      state: 'starting',
      restartCount: 0,
    }

    logger.info('Starting sandboxed process', {
      id: manifest.id,
      command: command.join(' '),
      permissions: manifest.permissions,
      limits: manifest.limits,
    })

    try {
      // Apply sandboxing based on platform
      const sandboxedCommand = await this.applySandbox(command, manifest)

      // Spawn the process
      const spawnOptions = {
        cwd: manifest.cwd,
        env: {
          ...process.env,
          ...manifest.env,
          // Add sandbox indicators
          MCP_SANDBOX: 'true',
          MCP_SERVER_ID: manifest.id,
        },
      }

      const cmd = sandboxedCommand[0]
      const args = sandboxedCommand.slice(1)

      const childProcess =
        manifest.transport.type === 'stdio'
          ? spawn(cmd || '', args, {
              ...spawnOptions,
              stdio: ['pipe', 'pipe', 'pipe'] as const,
            })
          : spawn(cmd || '', args, {
              ...spawnOptions,
              stdio: 'pipe',
            })

      if (childProcess.pid) {
        info.pid = childProcess.pid
      }
      info.state = 'running'
      info.startTime = new Date()

      // Store process info
      this.processes.set(manifest.id, {
        process: childProcess,
        info,
        manifest,
      })

      // Handle process events
      this.setupProcessHandlers(childProcess, info, manifest, options)

      this.emit('state-change', 'running', info)

      return info
    } catch (error) {
      info.state = 'failed'
      info.lastError = error instanceof Error ? error.message : String(error)

      logger.error('Failed to start sandboxed process', {
        id: manifest.id,
        error: info.lastError,
      })

      this.emit('state-change', 'failed', info)
      this.emit('error', error as Error, info)

      throw error
    }
  }

  /**
   * Stop a sandboxed process
   */
  async stop(id: string, force = false): Promise<void> {
    const entry = this.processes.get(id)
    if (!entry) {
      throw new Error(`Process ${id} is not running`)
    }

    const { process, info } = entry

    logger.info('Stopping sandboxed process', {
      id,
      pid: info.pid,
      force,
    })

    info.state = 'stopping'
    this.emit('state-change', 'stopping', info)

    return new Promise((resolve, _reject) => {
      const timeout = setTimeout(
        () => {
          logger.warn('Process did not stop gracefully, forcing', { id })
          process.kill('SIGKILL')
        },
        force ? 0 : 5000
      )

      process.once('exit', () => {
        clearTimeout(timeout)
        info.state = 'stopped'
        info.stopTime = new Date()
        this.processes.delete(id)
        this.emit('state-change', 'stopped', info)
        resolve()
      })

      process.kill(force ? 'SIGKILL' : 'SIGTERM')
    })
  }

  /**
   * Restart a process
   */
  async restart(id: string): Promise<SandboxedProcess> {
    const entry = this.processes.get(id)
    if (!entry) {
      throw new Error(`Process ${id} is not found`)
    }

    const { manifest } = entry

    logger.info('Restarting process', { id })

    // Stop if running
    if (entry.info.state === 'running') {
      await this.stop(id)
    }

    // Increment restart count
    const restartCount = entry.info.restartCount + 1

    // Check restart limit
    if (manifest.maxRestarts && restartCount > manifest.maxRestarts) {
      throw new Error(`Process ${id} exceeded maximum restart attempts (${manifest.maxRestarts})`)
    }

    // Start again
    const newInfo = await this.start(manifest, [], {}) // Command will be rebuilt
    newInfo.restartCount = restartCount

    this.emit('restart', restartCount, newInfo)

    return newInfo
  }

  /**
   * Get process info
   */
  getProcess(id: string): SandboxedProcess | undefined {
    return this.processes.get(id)?.info
  }

  /**
   * List all processes
   */
  listProcesses(): SandboxedProcess[] {
    return Array.from(this.processes.values()).map(entry => entry.info)
  }

  /**
   * Apply sandbox restrictions based on platform
   */
  private async applySandbox(command: string[], manifest: ServerManifest): Promise<string[]> {
    const platform = process.platform
    const permissions = manifest.permissions || {
      network: false,
      fsRead: false,
      fsWrite: false,
      env: false,
      spawn: false,
    }
    const limits = manifest.limits || {}

    // Platform-specific sandboxing
    switch (platform) {
      case 'linux':
        return this.applyLinuxSandbox(command, permissions, limits)

      case 'darwin':
        return this.applyMacOSSandbox(command, permissions, limits)

      case 'win32':
        return this.applyWindowsSandbox(command, permissions, limits)

      default:
        logger.warn('Platform sandboxing not available', { platform })
        return command
    }
  }

  /**
   * Linux sandboxing using firejail/bubblewrap if available
   */
  private async applyLinuxSandbox(
    command: string[],
    permissions: Permissions,
    limits: ResourceLimits
  ): Promise<string[]> {
    // Check if firejail is available
    const hasFirejail = await this.commandExists('firejail')

    if (hasFirejail) {
      const firejailArgs = ['firejail']

      // Network restrictions
      if (!permissions.network) {
        firejailArgs.push('--net=none')
      } else if (permissions.allowedHosts) {
        // Note: Firejail doesn't support fine-grained host control
        // Would need custom netfilter rules
      }

      // Filesystem restrictions
      if (!permissions.fsWrite) {
        firejailArgs.push('--read-only=~')
      }

      if (permissions.allowedPaths) {
        permissions.allowedPaths.forEach(path => {
          firejailArgs.push(`--whitelist=${path}`)
        })
      }

      // Resource limits
      if (limits.memory) {
        firejailArgs.push(`--rlimit-as=${limits.memory}M`)
      }

      if (limits.cpuTime) {
        firejailArgs.push(`--timeout=${limits.cpuTime}`)
      }

      return [...firejailArgs, '--', ...command]
    }

    // Fallback to no sandboxing with warning
    logger.warn('Firejail not available, running without sandbox')
    return command
  }

  /**
   * macOS sandboxing using sandbox-exec
   */
  private async applyMacOSSandbox(
    command: string[],
    permissions: Permissions,
    _limits: ResourceLimits
  ): Promise<string[]> {
    // macOS sandbox-exec with custom profile
    // This is limited compared to Linux options

    if (!permissions.network || !permissions.fsWrite) {
      // Generate a basic sandbox profile
      const profile = this.generateMacOSSandboxProfile(permissions)

      // Note: sandbox-exec is deprecated but still available
      // For production, consider using App Sandbox entitlements
      return ['sandbox-exec', '-p', profile, ...command]
    }

    return command
  }

  /**
   * Windows sandboxing (limited options)
   */
  private async applyWindowsSandbox(
    command: string[],
    _permissions: Permissions,
    _limits: ResourceLimits
  ): Promise<string[]> {
    // Windows has limited sandboxing options from command line
    // Consider using Windows Sandbox or AppContainers for production

    logger.warn('Windows sandboxing is limited, consider using WSL or containers')
    return command
  }

  /**
   * Generate macOS sandbox profile
   */
  private generateMacOSSandboxProfile(permissions: Permissions): string {
    const rules = ['(version 1)']

    // Network access
    if (!permissions.network) {
      rules.push('(deny network*)')
    } else {
      rules.push('(allow network*)')
    }

    // File system access
    if (!permissions.fsRead) {
      rules.push('(deny file-read*)')
    } else {
      rules.push('(allow file-read*)')
    }

    if (!permissions.fsWrite) {
      rules.push('(deny file-write*)')
    } else if (permissions.allowedPaths) {
      rules.push('(deny file-write*)')
      permissions.allowedPaths.forEach(path => {
        rules.push(`(allow file-write* (subpath "${path}"))`)
      })
    } else {
      rules.push('(allow file-write*)')
    }

    // Process spawning
    if (!permissions.spawn) {
      rules.push('(deny process*)')
    } else {
      rules.push('(allow process*)')
    }

    return rules.join(' ')
  }

  /**
   * Check if a command exists
   */
  private async commandExists(command: string): Promise<boolean> {
    return new Promise(resolve => {
      const checkCommand = process.platform === 'win32' ? 'where' : 'which'
      spawn(checkCommand, [command]).on('exit', code => {
        resolve(code === 0)
      })
    })
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(
    process: ChildProcess,
    info: SandboxedProcess,
    manifest: ServerManifest,
    options?: {
      onOutput?: (data: string) => void
      onError?: (error: Error) => void
    }
  ): void {
    // Handle stdout
    if (process.stdout) {
      process.stdout.on('data', (data: Buffer) => {
        const output = data.toString()
        this.emit('output', output, info)
        options?.onOutput?.(output)
      })
    }

    // Handle stderr
    if (process.stderr) {
      process.stderr.on('data', (data: Buffer) => {
        const output = data.toString()
        logger.debug('Process stderr', { id: info.id, output })
      })
    }

    // Handle errors
    process.on('error', (error: Error) => {
      logger.error('Process error', {
        id: info.id,
        error: error.message,
      })

      info.state = 'failed'
      info.lastError = error.message

      this.emit('error', error, info)
      options?.onError?.(error)
    })

    // Handle exit
    process.on('exit', (code, signal) => {
      logger.info('Process exited', {
        id: info.id,
        code,
        signal,
      })

      info.state = 'stopped'
      info.stopTime = new Date()

      // Auto-restart if configured and not manually stopped
      if (
        manifest.restartOnFailure &&
        code !== 0 &&
        info.restartCount < (manifest.maxRestarts || 3)
      ) {
        logger.info('Auto-restarting process', {
          id: info.id,
          restartCount: info.restartCount + 1,
        })

        setTimeout(() => {
          this.restart(info.id).catch(error => {
            logger.error('Auto-restart failed', {
              id: info.id,
              error: error.message,
            })
          })
        }, 1000) // Wait 1 second before restart
      }
    })
  }
}
