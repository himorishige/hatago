/**
 * DeepWiki MCP Client
 *
 * Client for connecting to the DeepWiki MCP server (https://mcp.deepwiki.com/mcp)
 * Handles session management and tool proxying
 */

import { extractSessionId, parseSSEResponse } from '../utils/sse-parser.js'

export interface DeepWikiTool {
  name: string
  description: string
  inputSchema: any
}

export class DeepWikiClient {
  private endpoint = 'https://mcp.deepwiki.com/mcp'
  private sessionId?: string
  private initialized = false
  private tools: DeepWikiTool[] = []

  constructor(private userId: string) {}

  /**
   * Initialize connection with DeepWiki MCP server
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'hatago-auth-poc',
            version: '0.1.0',
          },
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to initialize DeepWiki: ${response.status} ${response.statusText}`)
    }

    // Extract session ID from headers
    this.sessionId = extractSessionId(response)

    if (!this.sessionId) {
      throw new Error('No session ID received from DeepWiki')
    }

    // Parse SSE response
    const result = await parseSSEResponse(response)

    if (result.error) {
      throw new Error(`DeepWiki initialization error: ${result.error.message}`)
    }

    this.initialized = true
    console.log(`DeepWiki initialized for user ${this.userId} with session ${this.sessionId}`)
  }

  /**
   * List available tools from DeepWiki
   */
  async listTools(): Promise<DeepWikiTool[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (this.tools.length > 0) {
      return this.tools
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': this.sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to list tools: ${response.status} ${response.statusText}`)
    }

    const result = await parseSSEResponse(response)

    if (result.error) {
      throw new Error(`DeepWiki tools/list error: ${result.error.message}`)
    }

    this.tools = result.result.tools
    return this.tools
  }

  /**
   * Call a tool on DeepWiki
   */
  async callTool(toolName: string, args: any): Promise<any> {
    if (!this.initialized) {
      await this.initialize()
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': this.sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to call tool ${toolName}: ${response.status} ${response.statusText}`)
    }

    const result = await parseSSEResponse(response)

    if (result.error) {
      throw new Error(`DeepWiki tool error: ${result.error.message}`)
    }

    return result.result
  }

  /**
   * Get session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.initialized = false
    this.sessionId = undefined
    this.tools = []
  }
}
