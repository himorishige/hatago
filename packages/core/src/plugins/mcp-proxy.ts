import type {
  HatagoPlugin,
  HatagoPluginFactory,
  MCPProxyConfig,
  MCPServerConfig,
} from '../types.js'

/**
 * MCP Client for connecting to remote MCP servers
 * Uses fetch API for HTTP transport compatibility
 */
class MCPClient {
  private config: MCPServerConfig
  private baseUrl: string

  constructor(config: MCPServerConfig) {
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
        clientInfo: { name: 'hatago-proxy', version: '0.1.0' },
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

export interface MCPProxyPluginOptions {
  /** Single server configuration for basic proxy */
  server?: MCPServerConfig

  /** Full proxy configuration with multiple servers */
  config?: MCPProxyConfig
}

/**
 * MCP Proxy Plugin - Connects to remote MCP servers and proxies their tools
 */
export const mcpProxy: HatagoPluginFactory<MCPProxyPluginOptions> =
  (options: MCPProxyPluginOptions = {}): HatagoPlugin =>
  async ({ server }) => {
    // Get list of servers to connect to
    const serversToConnect: MCPServerConfig[] = []
    
    if (options.server) {
      serversToConnect.push(options.server)
    }
    
    if (options.config?.servers?.length) {
      serversToConnect.push(...options.config.servers)
    }
    
    if (serversToConnect.length === 0) {
      console.warn('MCP Proxy: No servers configured, skipping')
      return
    }

    console.log(`MCP Proxy: Connecting to ${serversToConnect.length} server(s)`)

    // Connect to each server and register their tools
    for (const serverConfig of serversToConnect) {
      await connectToServer(server, serverConfig)
    }
  }

/**
 * Connect to a single MCP server and register its tools
 */
async function connectToServer(server: any, serverConfig: MCPServerConfig) {
  const client = new MCPClient(serverConfig)

  try {
    // Initialize connection
    console.log(`MCP Proxy: Connecting to ${serverConfig.id} at ${serverConfig.endpoint}`)
    const initResult = await client.initialize()
    console.log(`MCP Proxy: Connected to ${serverConfig.id}:`, initResult.result?.serverInfo)

    // List available tools
    const toolsResult = await client.listTools()
    const remoteTools = toolsResult.result?.tools || []

    console.log(`MCP Proxy: Found ${remoteTools.length} tools from ${serverConfig.id}`)

    // Register each remote tool as a proxy
    for (const remoteTool of remoteTools) {
      const proxyToolName = `${serverConfig.id}:${remoteTool.name}`

      server.registerTool(
        proxyToolName,
        {
          title: `${remoteTool.title || remoteTool.name} (${serverConfig.id})`,
          description: `${remoteTool.description || 'Remote tool'} [Proxied from ${serverConfig.id}]`,
          inputSchema: {}, // Use empty object like hello-hatago plugin (no validation)
        },
        async (args: any, extra: any) => {
          try {
            // Forward the call to remote server
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
              `MCP Proxy: Error calling ${serverConfig.id}:${remoteTool.name}:`,
              error
            )
            throw error
          }
        }
      )

      console.log(`MCP Proxy: Registered tool ${proxyToolName}`)
    }
  } catch (error) {
    console.error(`MCP Proxy: Failed to connect to ${serverConfig.id} (${serverConfig.endpoint}):`, error)
    // Continue with other servers instead of failing completely
  }
}

export default mcpProxy
