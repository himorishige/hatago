/**
 * Mock MCP Servers Helper
 * Creates mock MCP servers for testing
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { HatagoPlugin } from '../../src/types.js'

/**
 * Create a simple mock MCP server
 */
export function createMockMCPServer(options?: {
  name?: string
  version?: string
  tools?: Array<{
    name: string
    description?: string
    handler?: (args: any) => any
  }>
  resources?: Array<{
    uri: string
    name?: string
    mimeType?: string
    content?: string
  }>
  prompts?: Array<{
    name: string
    description?: string
    handler?: (args: any) => any
  }>
}): McpServer {
  const server = new McpServer({
    name: options?.name ?? 'mock-server',
    version: options?.version ?? '1.0.0',
  })

  // Register tools
  options?.tools?.forEach(tool => {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description ?? `Mock tool ${tool.name}`,
      },
      async args => {
        if (tool.handler) {
          return tool.handler(args)
        }
        return {
          content: [
            {
              type: 'text',
              text: `Mock response from ${tool.name}`,
            },
          ],
        }
      }
    )
  })

  // Register resources
  options?.resources?.forEach(resource => {
    server.registerResource({
      uri: resource.uri,
      name: resource.name ?? resource.uri,
      mimeType: resource.mimeType ?? 'text/plain',
    })
  })

  // Register prompts
  options?.prompts?.forEach(prompt => {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.name,
        description: prompt.description ?? `Mock prompt ${prompt.name}`,
      },
      async args => {
        if (prompt.handler) {
          return prompt.handler(args)
        }
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `Mock prompt response from ${prompt.name}`,
              },
            },
          ],
        }
      }
    )
  })

  return server
}

/**
 * Create a mock Runner-managed server plugin
 */
export function createMockRunnerPlugin(): HatagoPlugin {
  return async ctx => {
    const { server } = ctx

    // Register a tool that simulates a Runner-managed server
    server.registerTool(
      'mock_runner_server',
      {
        title: 'Mock Runner Server',
        description: 'Simulates a server managed by Runner',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['start', 'stop', 'status', 'call'],
            },
            serverId: {
              type: 'string',
            },
            toolName: {
              type: 'string',
            },
            args: {
              type: 'object',
            },
          },
          required: ['action'],
        },
      },
      async ({ action, serverId, toolName, args }) => {
        switch (action) {
          case 'start':
            return {
              content: [
                {
                  type: 'text',
                  text: `Started server ${serverId}`,
                },
              ],
            }

          case 'stop':
            return {
              content: [
                {
                  type: 'text',
                  text: `Stopped server ${serverId}`,
                },
              ],
            }

          case 'status':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    serverId,
                    status: 'running',
                    pid: 12345,
                    uptime: 60000,
                  }),
                },
              ],
            }

          case 'call':
            return {
              content: [
                {
                  type: 'text',
                  text: `Called ${toolName} on ${serverId} with ${JSON.stringify(args)}`,
                },
              ],
            }

          default:
            throw new Error(`Unknown action: ${action}`)
        }
      }
    )
  }
}

/**
 * Create a mock server that simulates errors
 */
export function createErrorMockServer(): McpServer {
  const server = new McpServer({
    name: 'error-server',
    version: '1.0.0',
  })

  server.registerTool(
    'always_fails',
    {
      title: 'Always Fails',
      description: 'This tool always throws an error',
    },
    async () => {
      throw new Error('This tool is designed to fail')
    }
  )

  server.registerTool(
    'timeout_tool',
    {
      title: 'Timeout Tool',
      description: 'This tool times out',
    },
    async () => {
      await new Promise(resolve => setTimeout(resolve, 60000))
      return { content: [] }
    }
  )

  server.registerTool(
    'invalid_response',
    {
      title: 'Invalid Response',
      description: 'Returns invalid response',
    },
    async () => {
      return null as any // Invalid response
    }
  )

  return server
}

/**
 * Create a mock server with progress notifications
 */
export function createProgressMockServer(): McpServer {
  const server = new McpServer({
    name: 'progress-server',
    version: '1.0.0',
  })

  server.registerTool(
    'progress_tool',
    {
      title: 'Progress Tool',
      description: 'Tool that sends progress notifications',
    },
    async (_args, { progressToken }) => {
      if (progressToken) {
        // Send progress notifications
        for (let i = 0; i <= 100; i += 20) {
          await server.notification({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress: i,
              total: 100,
              message: `Processing... ${i}%`,
            },
          })

          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Progress complete!',
          },
        ],
      }
    }
  )

  return server
}

/**
 * Create a stdio server process for testing
 */
export async function createStdioMockServer(server: McpServer): Promise<{
  transport: StdioServerTransport
  cleanup: () => Promise<void>
}> {
  const transport = new StdioServerTransport()

  await server.connect(transport)

  const cleanup = async () => {
    await server.close()
  }

  return { transport, cleanup }
}
