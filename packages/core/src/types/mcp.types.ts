/**
 * MCP-related type definitions for enhanced type safety
 */

/**
 * Generic MCP JSON-RPC response structure
 */
export interface MCPResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number | string
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * MCP tool call arguments with proper typing
 */
export interface MCPToolArgs {
  [key: string]: unknown
}

/**
 * Plugin security tool arguments
 */
export interface PluginSecurityArgs {
  pluginName?: string
  signature?: string
  testData?: string
  algorithm?: 'ed25519' | 'rsa' | 'ecdsa'
}

/**
 * MCP server initialization result
 */
export interface MCPServerInfo {
  name: string
  version: string
  protocolVersion?: string
  capabilities?: {
    tools?: Record<string, unknown>
    resources?: Record<string, unknown>
    prompts?: Record<string, unknown>
  }
}

/**
 * MCP initialization response
 */
export interface MCPInitResult {
  protocolVersion: string
  capabilities: {
    tools?: Record<string, unknown>
    resources?: Record<string, unknown>
    prompts?: Record<string, unknown>
  }
  serverInfo: MCPServerInfo
}

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/**
 * MCP tools list response
 */
export interface MCPToolsResult {
  tools: MCPTool[]
}

/**
 * MCP tool call response
 */
export interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
  _meta?: {
    progressToken?: string
  }
}

/**
 * Progress notification
 */
export interface ProgressNotification {
  method: 'notifications/progress'
  params: {
    progressToken: string
    progress: number
    total?: number
  }
}

/**
 * Type guards for MCP responses
 */
export const MCPTypeGuards = {
  isInitResult: (value: unknown): value is MCPInitResult => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'protocolVersion' in value &&
      'capabilities' in value &&
      'serverInfo' in value
    )
  },

  isToolsResult: (value: unknown): value is MCPToolsResult => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'tools' in value &&
      Array.isArray((value as MCPToolsResult).tools)
    )
  },

  isToolCallResult: (value: unknown): value is MCPToolCallResult => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'content' in value &&
      Array.isArray((value as MCPToolCallResult).content)
    )
  },

  isMCPResponse: <T>(value: unknown): value is MCPResponse<T> => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'jsonrpc' in value &&
      (value as MCPResponse).jsonrpc === '2.0' &&
      'id' in value
    )
  },
}
