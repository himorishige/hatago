import type { HatagoPlugin } from '../system/types.js'
import type {
  MCPServerConfig as CoreMCPServerConfig,
  ProxyConfig,
  HatagoConfig,
} from '../config/types.js'
import { NamespaceManager } from '../config/namespace-manager.js'
import { loadConfig } from '../config/loader.js'
import { logger } from '../utils/logger.js'

// Legacy type compatibility
interface LegacyMCPServerConfig {
  id: string
  endpoint: string
  description?: string
  auth?: any
  timeout?: number
}

/**
 * Enhanced MCP Client for connecting to remote MCP servers
 * Supports the new configuration system and namespace management
 */
class EnhancedMCPClient {
  private config: CoreMCPServerConfig
  private baseUrl: string

  constructor(config: CoreMCPServerConfig) {
    this.config = config
    this.baseUrl = config.endpoint.endsWith('/') ? config.endpoint.slice(0, -1) : config.endpoint
  }

  /**
   * Initialize connection with remote MCP server
   */
  async initialize(): Promise<any> {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'hatago-enhanced-proxy', version: '0.1.0' },
      },
    }

    const response = await this.sendRequest(body)
    return response
  }

  /**
   * List available tools from remote server
   */
  async listTools(): Promise<any> {
    const body = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    }

    const response = await this.sendRequest(body)
    return response
  }

  /**
   * Call a tool on the remote server
   */
  async callTool(toolName: string, args: any, meta?: any): Promise<any> {
    const body = {
      jsonrpc: '2.0',
      id: Date.now(), // Simple ID generation
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
        ...(meta && { _meta: meta }),
      },
    }

    const response = await this.sendRequest(body)
    return response
  }

  /**
   * Health check for the remote server
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize()
      return true
    } catch (error) {
      logger.warn('Health check failed', {
        server_id: this.config.id,
        error: { message: (error as Error).message },
      })
      return false
    }
  }

  private async sendRequest(body: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }

    // Add authentication if configured
    if (this.config.auth) {
      switch (this.config.auth.type) {
        case 'bearer':
          if (this.config.auth.token) {
            headers.Authorization = `Bearer ${this.config.auth.token}`
          }
          break
        case 'basic':
          if (this.config.auth.username && this.config.auth.password) {
            const credentials = btoa(`${this.config.auth.username}:${this.config.auth.password}`)
            headers.Authorization = `Basic ${credentials}`
          }
          break
        case 'custom':
          if (this.config.auth.headers) {
            Object.assign(headers, this.config.auth.headers)
          }
          break
      }
    }

    const timeout = this.config.timeout || 30000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle streaming response (SSE format)
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('text/event-stream')) {
        return this.parseSSEResponse(response)
      }

      // Handle JSON response
      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private async parseSSEResponse(response: Response): Promise<any> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let result: any = null
    const progressNotifications: any[] = []

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              // Handle different message types
              if (data.method === 'notifications/progress') {
                progressNotifications.push(data)
              } else if (data.result || data.error) {
                result = data
              }
            } catch (_e) {
              // Ignore invalid JSON in SSE stream
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Return result with progress notifications
    return {
      ...result,
      _progressNotifications: progressNotifications,
    }
  }
}

export interface EnhancedMCPProxyOptions {
  /** Use configuration file (default: true) */
  useConfig?: boolean
  /** Override config file path */
  configPath?: string
  /** Legacy single server configuration for backward compatibility */
  server?: LegacyMCPServerConfig
  /** Legacy full proxy configuration for backward compatibility */
  config?: { servers: LegacyMCPServerConfig[] }
}

/**
 * Enhanced MCP Proxy Plugin with namespace management
 * Supports configuration files and advanced namespace handling
 */
export const enhancedMcpProxy =
  (options: EnhancedMCPProxyOptions = {}): HatagoPlugin =>
  async ({ server }) => {
    let proxyConfig: ProxyConfig
    let namespaceManager: NamespaceManager

    // Determine configuration source
    if (options.useConfig !== false) {
      try {
        const hatagoConfig = await loadConfig(options.configPath)
        proxyConfig = hatagoConfig.proxy || {
          servers: [],
          namespaceStrategy: 'prefix',
          conflictResolution: 'error',
        }
        logger.info('Enhanced MCP Proxy using configuration file')
      } catch (error) {
        logger.warn('Enhanced MCP Proxy failed to load config file, falling back to options', {
          error: { message: (error as Error).message },
        })
        proxyConfig = createLegacyConfig(options)
      }
    } else {
      proxyConfig = createLegacyConfig(options)
    }

    // Initialize namespace manager
    namespaceManager = new NamespaceManager(proxyConfig)

    if (proxyConfig.servers.length === 0) {
      logger.warn('Enhanced MCP Proxy: No servers configured, skipping')
      return
    }

    logger.info('Enhanced MCP Proxy: Connecting to servers', {
      server_count: proxyConfig.servers.length,
      servers: proxyConfig.servers.map(s => ({ id: s.id, endpoint: s.endpoint })),
    })

    // Connect to each server and register their tools
    const connectionPromises = proxyConfig.servers.map(serverConfig =>
      connectToEnhancedServer(server, serverConfig, namespaceManager)
    )

    // Wait for all connections (continue even if some fail)
    await Promise.allSettled(connectionPromises)

    // Log namespace statistics
    const stats = namespaceManager.getStatistics()
    logger.info('Enhanced MCP Proxy: Registration complete', {
      total_tools: stats.totalTools,
      conflicts: stats.totalConflicts,
      server_counts: stats.serverCounts,
    })

    // Log conflicts if any
    const conflicts = namespaceManager.getConflicts()
    if (conflicts.length > 0) {
      logger.warn('Enhanced MCP Proxy: Tool name conflicts detected', {
        conflict_count: conflicts.length,
        conflicts: conflicts.map(conflict => ({
          tool_name: conflict.toolName,
          existing_server: conflict.existing.server,
          attempted_server: conflict.attempted.server,
          suggestion: conflict.suggestion,
        })),
      })
    }

    // Set up health checks if enabled
    setupHealthChecks(proxyConfig.servers)
  }

/**
 * Connect to a single enhanced MCP server
 */
async function connectToEnhancedServer(
  server: any,
  serverConfig: CoreMCPServerConfig,
  namespaceManager: NamespaceManager
) {
  const client = new EnhancedMCPClient(serverConfig)
  const serverLogger = logger.child({ server_id: serverConfig.id, endpoint: serverConfig.endpoint })

  try {
    // Initialize connection
    serverLogger.info('Initializing connection to MCP server')
    const startTime = Date.now()

    const initResult = await client.initialize()
    const duration = Date.now() - startTime

    serverLogger.info('Connection established successfully', {
      duration_ms: duration,
      server_info: initResult?.result?.serverInfo,
    })

    // List available tools
    const toolsStartTime = Date.now()
    const toolsResult = await client.listTools()
    const toolsDuration = Date.now() - toolsStartTime
    const remoteTools = toolsResult?.result?.tools || []

    serverLogger.info('Retrieved tools from server', {
      tool_count: remoteTools.length,
      duration_ms: toolsDuration,
      tools: remoteTools.map((t: any) => t.name),
    })

    // Register each remote tool through namespace manager
    for (const remoteTool of remoteTools) {
      try {
        const mappedToolName = namespaceManager.registerTool(serverConfig, remoteTool)

        server.registerTool(
          mappedToolName,
          {
            title: `${remoteTool.title || remoteTool.name} (${serverConfig.id})`,
            description: `${remoteTool.description || 'Remote tool'} [Proxied from ${serverConfig.id}]`,
            inputSchema: {}, // Use empty schema like other plugins
          },
          async (args: any, extra: any) => {
            try {
              // Forward the call to remote server using original tool name
              const response = await client.callTool(remoteTool.name, args, (extra as any)?._meta)

              // Handle progress notifications if present
              if (response._progressNotifications && (extra as any).sendNotification) {
                for (const notification of response._progressNotifications) {
                  try {
                    await (extra as any).sendNotification(notification)
                  } catch (e) {
                    console.error('Failed to forward progress notification:', e)
                  }
                }
              }

              return response.result || response
            } catch (error) {
              console.error(
                `Enhanced MCP Proxy: Error calling ${serverConfig.id}:${remoteTool.name}:`,
                error
              )
              throw error
            }
          }
        )

        serverLogger.debug('Tool registered successfully', {
          tool: remoteTool.name,
          mapped_name: mappedToolName,
        })
      } catch (error) {
        if (error instanceof Error && error.message.includes('excluded')) {
          serverLogger.debug('Tool excluded by configuration', { tool: remoteTool.name })
        } else {
          serverLogger.error('Failed to register tool', {
            tool: remoteTool.name,
            error: { message: (error as Error).message, stack: (error as Error).stack },
          })
        }
      }
    }
  } catch (error) {
    serverLogger.error('Failed to connect to MCP server', {
      error: { message: (error as Error).message, stack: (error as Error).stack },
    })
  }
}

/**
 * Create legacy configuration from options for backward compatibility
 */
function createLegacyConfig(options: EnhancedMCPProxyOptions): ProxyConfig {
  const servers: CoreMCPServerConfig[] = []

  if (options.server) {
    servers.push({
      id: options.server.id,
      endpoint: options.server.endpoint,
      description: options.server.description,
      timeout: options.server.timeout,
    })
  }

  if (options.config?.servers) {
    servers.push(
      ...options.config.servers.map(s => ({
        id: s.id,
        endpoint: s.endpoint,
        description: s.description,
        timeout: s.timeout,
      }))
    )
  }

  return {
    servers,
    namespaceStrategy: 'prefix',
    conflictResolution: 'error',
  }
}

/**
 * Set up health checks for servers
 */
function setupHealthChecks(servers: CoreMCPServerConfig[]) {
  for (const serverConfig of servers) {
    if (serverConfig.healthCheck?.enabled) {
      const client = new EnhancedMCPClient(serverConfig)
      const interval = serverConfig.healthCheck.interval || 30000

      setInterval(async () => {
        const isHealthy = await client.healthCheck()
        if (!isHealthy) {
          logger.warn('Health check failed for server', {
            server_id: serverConfig.id,
            endpoint: serverConfig.endpoint,
          })
          // Could emit events or take corrective action here
        }
      }, interval)

      logger.info('Health check enabled for server', {
        server_id: serverConfig.id,
        interval_ms: interval,
      })
    }
  }
}

export default enhancedMcpProxy
