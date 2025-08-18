/**
 * Runner Manager for MCP server lifecycle management
 */

import { EventEmitter } from 'node:events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createDefaultLogger } from '../logger/index.js'
import {
  type RunnerConfig,
  type ServerManifest,
  buildCommand,
  validateManifest,
} from './manifest.js'
import { ProcessSandbox, type SandboxedProcess } from './sandbox.js'

const logger = createDefaultLogger('runner-manager')

/**
 * MCP client connection info
 */
export interface McpConnection {
  serverId: string
  client: Client
  transport: StdioClientTransport
  connected: boolean
  capabilities?: any
}

/**
 * Runner manager events
 */
export interface RunnerManagerEvents {
  'server-started': (serverId: string, process: SandboxedProcess) => void
  'server-stopped': (serverId: string) => void
  'server-failed': (serverId: string, error: Error) => void
  'server-connected': (serverId: string, connection: McpConnection) => void
  'server-disconnected': (serverId: string) => void
}

/**
 * Options for starting a server
 */
export interface StartOptions {
  /** Wait for connection before returning */
  waitForConnection?: boolean

  /** Connection timeout in ms */
  connectionTimeout?: number

  /** Override environment variables */
  env?: Record<string, string>
}

/**
 * Runner Manager for managing MCP server processes
 */
export class RunnerManager extends EventEmitter {
  private sandbox: ProcessSandbox
  private connections = new Map<string, McpConnection>()
  private manifests = new Map<string, ServerManifest>()
  private config?: RunnerConfig

  constructor(config?: RunnerConfig) {
    super()
    this.sandbox = new ProcessSandbox()
    if (config) {
      this.config = config
    }

    // Register manifests from config
    if (config?.servers) {
      config.servers.forEach(manifest => {
        this.registerManifest(manifest)
      })
    }

    // Setup sandbox event handlers
    this.setupSandboxHandlers()
  }

  /**
   * Register a server manifest
   */
  registerManifest(manifest: ServerManifest): void {
    const validated = validateManifest(manifest)
    this.manifests.set(validated.id, validated)

    logger.info('Manifest registered', {
      id: validated.id,
      name: validated.name,
      package: validated.package,
    })
  }

  /**
   * Start a server by manifest ID
   */
  async startServer(serverId: string, options: StartOptions = {}): Promise<SandboxedProcess> {
    const manifest = this.manifests.get(serverId)
    if (!manifest) {
      throw new Error(`Server manifest not found: ${serverId}`)
    }

    logger.info('Starting MCP server', {
      id: serverId,
      package: manifest.package,
      transport: manifest.transport.type,
    })

    // Build command
    const commandOptions: { useCache?: boolean; registry?: string } = {
      useCache: true,
    }
    if (this.config?.registry) {
      commandOptions.registry = this.config.registry
    }
    const command = buildCommand(manifest, commandOptions)

    // Merge environment variables
    const env = {
      ...manifest.env,
      ...options.env,
    }

    // Start sandboxed process
    const process = await this.sandbox.start({ ...manifest, env }, command)

    this.emit('server-started', serverId, process)

    // Connect if stdio transport
    if (manifest.transport.type === 'stdio' && options.waitForConnection) {
      try {
        const connection = await this.connectToServer(serverId, process, options.connectionTimeout)
        this.emit('server-connected', serverId, connection)
      } catch (error) {
        logger.error('Failed to connect to server', {
          id: serverId,
          error: error instanceof Error ? error.message : String(error),
        })

        // Stop the process if connection fails
        await this.stopServer(serverId)
        throw error
      }
    }

    return process
  }

  /**
   * Stop a server
   */
  async stopServer(serverId: string, force = false): Promise<void> {
    logger.info('Stopping MCP server', { id: serverId, force })

    // Disconnect MCP client
    const connection = this.connections.get(serverId)
    if (connection) {
      await this.disconnectFromServer(serverId)
    }

    // Stop process
    await this.sandbox.stop(serverId, force)

    this.emit('server-stopped', serverId)
  }

  /**
   * Restart a server
   */
  async restartServer(serverId: string): Promise<SandboxedProcess> {
    logger.info('Restarting MCP server', { id: serverId })

    // Disconnect if connected
    if (this.connections.has(serverId)) {
      await this.disconnectFromServer(serverId)
    }

    // Restart process
    const process = await this.sandbox.restart(serverId)

    // Reconnect if stdio
    const manifest = this.manifests.get(serverId)
    if (manifest?.transport.type === 'stdio') {
      try {
        const connection = await this.connectToServer(serverId, process)
        this.emit('server-connected', serverId, connection)
      } catch (error) {
        logger.error('Failed to reconnect after restart', {
          id: serverId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return process
  }

  /**
   * Connect to a stdio MCP server
   */
  private async connectToServer(
    serverId: string,
    _process: SandboxedProcess,
    timeout = 5000
  ): Promise<McpConnection> {
    const manifest = this.manifests.get(serverId)
    if (!manifest) {
      throw new Error(`Manifest not found: ${serverId}`)
    }

    if (manifest.transport.type !== 'stdio') {
      throw new Error(`Server ${serverId} does not use stdio transport`)
    }

    // Get the child process from sandbox
    const sandboxProcess = this.sandbox.getProcess(serverId)
    if (!sandboxProcess) {
      throw new Error(`Process not found: ${serverId}`)
    }

    // Note: sandboxProcess doesn't expose the underlying ChildProcess directly

    logger.info('Connecting to MCP server via stdio', { id: serverId })

    // Create MCP client
    const client = new Client(
      {
        name: `hatago-runner-${serverId}`,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    )

    // Create stdio transport
    const transport = new StdioClientTransport({
      command: manifest.package,
      args: manifest.args || [],
      env: manifest.env,
    } as any)

    // Connect with timeout
    const connectPromise = client.connect(transport)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), timeout)
    })

    try {
      await Promise.race([connectPromise, timeoutPromise])

      const connection: McpConnection = {
        serverId,
        client,
        transport,
        connected: true,
        capabilities: client.getServerCapabilities(),
      }

      this.connections.set(serverId, connection)

      logger.info('Connected to MCP server', {
        id: serverId,
        capabilities: connection.capabilities,
      })

      return connection
    } catch (error) {
      logger.error('Failed to connect to MCP server', {
        id: serverId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Disconnect from a server
   */
  private async disconnectFromServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) {
      return
    }

    logger.info('Disconnecting from MCP server', { id: serverId })

    try {
      await connection.client.close()
      await connection.transport.close()
    } catch (error) {
      logger.error('Error during disconnect', {
        id: serverId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    this.connections.delete(serverId)
    this.emit('server-disconnected', serverId)
  }

  /**
   * Get connection for a server
   */
  getConnection(serverId: string): McpConnection | undefined {
    return this.connections.get(serverId)
  }

  /**
   * List all registered servers
   */
  listServers(): ServerManifest[] {
    return Array.from(this.manifests.values())
  }

  /**
   * List running servers
   */
  listRunningServers(): SandboxedProcess[] {
    return this.sandbox.listProcesses()
  }

  /**
   * Auto-start servers marked for auto-start
   */
  async autoStart(): Promise<void> {
    const autoStartServers = Array.from(this.manifests.values()).filter(
      manifest => manifest.autoStart
    )

    logger.info('Auto-starting servers', {
      count: autoStartServers.length,
      servers: autoStartServers.map(s => s.id),
    })

    for (const manifest of autoStartServers) {
      try {
        await this.startServer(manifest.id, {
          waitForConnection: manifest.transport.type === 'stdio',
        })
      } catch (error) {
        logger.error('Failed to auto-start server', {
          id: manifest.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    const running = this.listRunningServers()

    logger.info('Stopping all servers', { count: running.length })

    await Promise.all(
      running.map(process =>
        this.stopServer(process.id).catch(error => {
          logger.error('Failed to stop server', {
            id: process.id,
            error: error instanceof Error ? error.message : String(error),
          })
        })
      )
    )
  }

  /**
   * Health check for a server
   */
  async healthCheck(serverId: string): Promise<boolean> {
    const process = this.sandbox.getProcess(serverId)
    if (!process || process.state !== 'running') {
      return false
    }

    const connection = this.connections.get(serverId)
    if (!connection) {
      // For HTTP transport, check if process is running
      return process.state === 'running'
    }

    // For stdio, try to list tools as health check
    try {
      await connection.client.listTools()
      return true
    } catch {
      return false
    }
  }

  /**
   * Setup sandbox event handlers
   */
  private setupSandboxHandlers(): void {
    this.sandbox.on('state-change', (state, process) => {
      logger.debug('Server state changed', {
        id: process.id,
        state,
        pid: process.pid,
      })
    })

    this.sandbox.on('error', (error, process) => {
      logger.error('Server process error', {
        id: process.id,
        error: error.message,
      })

      this.emit('server-failed', process.id, error)
    })

    this.sandbox.on('restart', (count, process) => {
      logger.info('Server restarted', {
        id: process.id,
        restartCount: count,
      })
    })
  }
}

/**
 * Create a runner manager with example servers
 */
export function createExampleRunnerManager(): RunnerManager {
  const manager = new RunnerManager()

  // Register example servers
  manager.registerManifest({
    id: 'example-echo',
    name: 'Echo Server',
    description: 'Simple echo MCP server',
    package: '@modelcontextprotocol/server-echo',
    packageManager: 'npx',
    transport: { type: 'stdio' },
    autoStart: false,
    restartOnFailure: true,
    maxRestarts: 3,
  })

  return manager
}
