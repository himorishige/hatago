/**
 * Test MCP Client Helper
 * Provides a simple MCP client for integration testing
 */

import type {
  NotificationMessage,
  RequestMessage,
  ResponseMessage,
} from '@modelcontextprotocol/sdk/types.js'

export interface MCPClientOptions {
  baseUrl: string
  sessionId?: string
  timeout?: number
}

export class TestMCPClient {
  private baseUrl: string
  private sessionId?: string
  private timeout: number
  private messageId = 0

  constructor(options: MCPClientOptions) {
    this.baseUrl = options.baseUrl
    this.sessionId = options.sessionId
    this.timeout = options.timeout ?? 5000
  }

  /**
   * Send a request and parse SSE response
   */
  async request<T = any>(method: string, params?: any): Promise<T> {
    const message: RequestMessage = {
      jsonrpc: '2.0',
      id: ++this.messageId,
      method,
      params,
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    }

    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId
    }

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Parse SSE response
    const text = await response.text()
    const result = this.parseSSE(text)

    // Update session ID if present
    const newSessionId = response.headers.get('mcp-session-id')
    if (newSessionId) {
      this.sessionId = newSessionId
    }

    return result as T
  }

  /**
   * Send a notification (no response expected)
   */
  async notify(method: string, params?: any): Promise<void> {
    const message: NotificationMessage = {
      jsonrpc: '2.0',
      method,
      params,
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }

    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId
    }

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }

  /**
   * Initialize the MCP connection
   */
  async initialize(params?: {
    protocolVersion?: string
    capabilities?: any
    clientInfo?: { name: string; version: string }
  }): Promise<any> {
    return this.request('initialize', {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: params?.capabilities ?? {},
      clientInfo: params?.clientInfo ?? {
        name: 'test-client',
        version: '1.0.0',
      },
    })
  }

  /**
   * List available tools
   */
  async listTools(): Promise<{ tools: any[] }> {
    return this.request('tools/list')
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args?: any, meta?: { progressToken?: string }): Promise<any> {
    return this.request('tools/call', {
      name,
      arguments: args ?? {},
      ...(meta && { _meta: meta }),
    })
  }

  /**
   * List resources
   */
  async listResources(): Promise<{ resources: any[] }> {
    return this.request('resources/list')
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any> {
    return this.request('resources/read', { uri })
  }

  /**
   * List prompts
   */
  async listPrompts(): Promise<{ prompts: any[] }> {
    return this.request('prompts/list')
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: any): Promise<any> {
    return this.request('prompts/get', {
      name,
      arguments: args ?? {},
    })
  }

  /**
   * Parse SSE response
   */
  private parseSSE(text: string): any {
    const lines = text.split('\n')
    const events: any[] = []
    let currentEvent: any = {}

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data) {
          try {
            currentEvent.data = JSON.parse(data)
            events.push({ ...currentEvent })
          } catch (_e) {
            currentEvent.data = data
            events.push({ ...currentEvent })
          }
        }
      } else if (line === '') {
        currentEvent = {}
      }
    }

    // Find the result message
    const resultEvent = events.find(
      e =>
        e.data?.jsonrpc === '2.0' && (e.data?.result !== undefined || e.data?.error !== undefined)
    )

    if (resultEvent?.data?.error) {
      throw new Error(`MCP Error ${resultEvent.data.error.code}: ${resultEvent.data.error.message}`)
    }

    return resultEvent?.data?.result ?? events
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId
  }

  /**
   * Set session ID
   */
  setSessionId(id: string | undefined): void {
    this.sessionId = id
  }
}

/**
 * Create a test client and initialize it
 */
export async function createTestClient(
  baseUrl: string,
  options?: {
    sessionId?: string
    clientInfo?: { name: string; version: string }
  }
): Promise<TestMCPClient> {
  const client = new TestMCPClient({
    baseUrl,
    sessionId: options?.sessionId,
  })

  await client.initialize({
    clientInfo: options?.clientInfo,
  })

  return client
}
